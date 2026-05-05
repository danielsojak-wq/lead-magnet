import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APIFY_META_ACTOR = "apify~facebook-ads-scraper";
const APIFY_GOOGLE_ACTOR = Deno.env.get("APIFY_GOOGLE_ADS_ACTOR") || "easyapi~google-ads-transparency-center-scraper";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN");
    if (!APIFY_TOKEN) return bad("APIFY_API_TOKEN není nastaven", 500);

    const body = await req.json().catch(() => ({}));
    const { action } = body || {};
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (action === "start") {
      const { client_slug, library_url, created_by_email, max_ads, competitor_id, active_only, source } = body;
      if (!client_slug || !library_url) return bad("client_slug a library_url jsou povinné");
      if (!competitor_id) return bad("competitor_id je povinné");

      const adSource: "meta" | "google" = source === "google" ? "google" : "meta";

      let normalizedUrl: string | null = null;
      let apifyActor: string;
      let apifyInput: Record<string, unknown>;

      if (adSource === "google") {
        normalizedUrl = normalizeGoogleUrl(library_url);
        if (!normalizedUrl) {
          return bad("Neplatná Google Ads Transparency URL — vlož odkaz z https://adstransparency.google.com/", 400);
        }
        apifyActor = APIFY_GOOGLE_ACTOR;
        apifyInput = {
          startUrls: [{ url: normalizedUrl }],
          maxItems: Math.min(Number(max_ads) || 50, 200),
        };
      } else {
        normalizedUrl = normalizeMetaUrl(library_url);
        if (!normalizedUrl) {
          return bad("Neplatná Meta Ad Library URL — vlož celý odkaz z Meta Ad Library (https://www.facebook.com/ads/library/?...)", 400);
        }
        apifyActor = APIFY_META_ACTOR;
        apifyInput = {
          startUrls: [{ url: normalizedUrl }],
          resultsLimit: Math.min(Number(max_ads) || 50, 200),
          activeStatus: active_only === false ? "" : "active",
        };
      }

      // Spustit Apify actor asynchronně
      const startRes = await fetch(
        `https://api.apify.com/v2/acts/${apifyActor}/runs?token=${APIFY_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(apifyInput),
        },
      );
      const startData = await startRes.json();
      if (!startRes.ok) {
        console.error("Apify start error:", startData);
        return bad("Apify: " + (startData?.error?.message || startRes.status), 502);
      }
      const apifyRunId = startData?.data?.id;

      const { data: runRow, error: insertErr } = await supa
        .from("competitor_scrape_runs")
        .insert({
          client_slug,
          library_url: normalizedUrl,
          apify_run_id: apifyRunId,
          status: "running",
          created_by_email: created_by_email || null,
          competitor_id,
          ad_source: adSource,
        })
        .select()
        .single();
      if (insertErr) return bad(insertErr.message, 500);

      return ok({ run_id: runRow.id, apify_run_id: apifyRunId, status: "running" });
    }

    if (action === "poll") {
      const { run_id } = body;
      if (!run_id) return bad("run_id je povinné");

      const { data: runRow, error: runErr } = await supa
        .from("competitor_scrape_runs")
        .select("*")
        .eq("id", run_id)
        .single();
      if (runErr || !runRow) return bad("Run nenalezen", 404);
      if (runRow.status === "succeeded" || runRow.status === "failed") {
        return ok({ status: runRow.status, ads_count: runRow.ads_count, error: runRow.error_message });
      }

      // Zkontroluj stav Apify runu
      const statusRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runRow.apify_run_id}?token=${APIFY_TOKEN}`,
      );
      const statusData = await statusRes.json();
      const apifyStatus = statusData?.data?.status;
      const datasetId = statusData?.data?.defaultDatasetId;

      if (apifyStatus === "RUNNING" || apifyStatus === "READY") {
        return ok({ status: "running" });
      }

      if (apifyStatus !== "SUCCEEDED") {
        await supa.from("competitor_scrape_runs").update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error_message: `Apify status: ${apifyStatus}`,
        }).eq("id", run_id);
        return ok({ status: "failed", error: `Apify status: ${apifyStatus}` });
      }

      // Stáhnout dataset
      const itemsRes = await fetch(
        `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&clean=true&format=json`,
      );
      const items: any[] = await itemsRes.json();

      const compId = (runRow as any).competitor_id;
      const adSource: "meta" | "google" = (runRow as any).ad_source === "google" ? "google" : "meta";
      const rows = adSource === "google"
        ? items.map((it) => mapGoogleItem(it, runRow.client_slug, run_id, compId))
        : items.map((it) => { const r = mapApifyItem(it, runRow.client_slug, run_id); if (compId) (r as any).competitor_id = compId; return r; });

      let inserted = 0;
      if (rows.length) {
        // upsert podle (client_slug, ad_archive_id)
        const { error: upErr, count } = await supa
          .from("competitor_ads")
          .upsert(rows, { onConflict: "client_slug,ad_archive_id", ignoreDuplicates: false, count: "exact" });
        if (upErr) {
          console.error("Upsert error:", upErr);
          await supa.from("competitor_scrape_runs").update({
            status: "failed",
            finished_at: new Date().toISOString(),
            error_message: upErr.message,
          }).eq("id", run_id);
          return bad(upErr.message, 500);
        }
        inserted = count || rows.length;
      }

      // Klasifikace reklam přes Lovable AI (na pozadí, neblokujeme úspěch runu)
      try {
        await classifyAds(supa, runRow.client_slug, run_id);
      } catch (e) {
        console.error("Klasifikace selhala:", e);
      }

      await supa.from("competitor_scrape_runs").update({
        status: "succeeded",
        finished_at: new Date().toISOString(),
        ads_count: inserted,
      }).eq("id", run_id);

      return ok({ status: "succeeded", ads_count: inserted });
    }

    if (action === "list") {
      const { client_slug, competitor_id } = body;
      if (!client_slug) return bad("client_slug je povinné");
      let q = supa
        .from("competitor_ads")
        .select("*")
        .eq("client_slug", client_slug)
        .order("ad_start_date", { ascending: true, nullsFirst: false });
      if (competitor_id) q = q.eq("competitor_id", competitor_id);
      const { data: ads, error } = await q;
      if (error) return bad(error.message, 500);

      let rq = supa
        .from("competitor_scrape_runs")
        .select("*")
        .eq("client_slug", client_slug)
        .order("started_at", { ascending: false })
        .limit(20);
      if (competitor_id) rq = rq.eq("competitor_id", competitor_id);
      const { data: runs } = await rq;

      return ok({ ads: ads || [], runs: runs || [] });
    }

    if (action === "set_inspiration") {
      const { ad_id, is_inspiration } = body;
      if (!ad_id) return bad("ad_id je povinné");
      const { error } = await supa
        .from("competitor_ads")
        .update({ is_inspiration: !!is_inspiration })
        .eq("id", ad_id);
      if (error) return bad(error.message, 500);
      return ok({ ok: true });
    }

    return bad("Neznámá akce");
  } catch (e: any) {
    console.error("scrape-competitor-ads error:", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Normalize Meta Ad Library URL — accept bare query strings, page IDs, or full URLs
function normalizeMetaUrl(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) {
    try { new URL(s); return s; } catch { return null; }
  }
  if (/^\d+$/.test(s)) {
    return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=CZ&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=${s}`;
  }
  const m = s.match(/view_all_page_id=(\d+)/);
  if (m) {
    const qs = s.replace(/^[?&=]+/, "");
    return `https://www.facebook.com/ads/library/?${qs}`;
  }
  return null;
}

// Normalize Google Ads Transparency Center URL
function normalizeGoogleUrl(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) {
    try { new URL(s); return s; } catch { return null; }
  }
  // Bare advertiser ID (e.g. "AR12345678")
  if (/^AR\d+$/i.test(s)) {
    return `https://adstransparency.google.com/advertiser/${s.toUpperCase()}`;
  }
  return null;
}

function mapApifyItem(it: any, client_slug: string, run_id: string) {
  const snapshot = it?.snapshot || it;
  const startTs = it?.start_date || it?.startDate || snapshot?.creation_time;
  const endTs = it?.end_date || it?.endDate;
  const toDate = (v: any) => {
    if (!v) return null;
    const n = typeof v === "number" ? v * (v < 1e12 ? 1000 : 1) : Date.parse(v);
    if (!n || isNaN(n)) return null;
    return new Date(n).toISOString().slice(0, 10);
  };
  const images = snapshot?.images || it?.images || [];
  const cards = snapshot?.cards || it?.cards || [];
  const videos = snapshot?.videos || it?.videos || [];
  const firstImage = images[0] || cards.find((card: any) => card?.originalImageUrl || card?.resizedImageUrl || card?.original_image_url || card?.resized_image_url);
  const firstImg = firstImage?.originalImageUrl || firstImage?.resizedImageUrl || firstImage?.original_image_url || firstImage?.resized_image_url || firstImage?.url || it?.image_url || it?.imageUrl || null;
  const firstVideo = videos[0] || cards.find((card: any) => card?.videoHdUrl || card?.videoSdUrl || card?.video_hd_url || card?.video_sd_url);
  const firstVid = firstVideo?.videoHdUrl || firstVideo?.videoSdUrl || firstVideo?.videoPreviewImageUrl || firstVideo?.video_hd_url || firstVideo?.video_sd_url || firstVideo?.url || null;
  return {
    client_slug,
    scrape_run_id: run_id,
    ad_archive_id: String(it?.ad_archive_id || it?.adArchiveID || it?.id || crypto.randomUUID()),
    page_name: it?.page_name || snapshot?.page_name || null,
    image_url: firstImg,
    video_url: firstVid,
    primary_text: snapshot?.body?.text || snapshot?.title || it?.primary_text || it?.ad_creative_body || null,
    ad_start_date: toDate(startTs),
    ad_end_date: toDate(endTs),
    is_active: it?.is_active ?? (endTs ? false : true),
    link_url: snapshot?.link_url || it?.link_url || null,
    cta_text: snapshot?.cta_text || it?.cta_text || null,
    ad_source: "meta",
    raw: it,
  };
}

function mapGoogleItem(it: any, client_slug: string, run_id: string, competitor_id: string | null) {
  const toDate = (v: any) => {
    if (!v) return null;
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const n = typeof v === "number" ? v * (v < 1e12 ? 1000 : 1) : Date.parse(v);
    if (!n || isNaN(n)) return null;
    return new Date(n).toISOString().slice(0, 10);
  };

  // Support multiple field naming conventions across different Apify actors
  const rawId = it?.creativeId || it?.creative_id || it?.id || it?.adId || it?.ad_id || crypto.randomUUID();
  // Prefix with g_ to avoid collision with Meta ad_archive_ids
  const adArchiveId = `g_${rawId}`;

  const advertiserName = it?.advertiserName || it?.advertiser_name || it?.advertiser || it?.pageName || it?.page_name || null;
  const headline = it?.headline || it?.title || it?.adTitle || it?.ad_title || null;
  const description = it?.description || it?.body || it?.adBody || it?.ad_body || it?.text || null;
  const primaryText = [headline, description].filter(Boolean).join("\n") || null;

  const imageUrl = it?.imageUrl || it?.image_url || it?.thumbnailUrl || it?.thumbnail_url ||
    it?.creativeImage || it?.creative_image || it?.screenshot || null;
  const videoUrl = it?.videoUrl || it?.video_url || it?.videoPreviewUrl || it?.video_preview_url || null;

  const startDate = toDate(it?.firstShownDate || it?.first_shown_date || it?.startDate || it?.start_date || it?.firstSeen || it?.first_seen);
  const endDate = toDate(it?.lastShownDate || it?.last_shown_date || it?.endDate || it?.end_date || it?.lastSeen || it?.last_seen);

  const isActive = it?.isActive ?? it?.is_active ?? it?.active ?? (endDate ? false : true);

  const linkUrl = it?.destinationUrl || it?.destination_url || it?.targetUrl || it?.target_url ||
    it?.landingPage || it?.landing_page || it?.url || null;
  const ctaText = it?.callToAction || it?.call_to_action || it?.cta || it?.ctaText || it?.cta_text || null;

  return {
    client_slug,
    scrape_run_id: run_id,
    competitor_id: competitor_id || null,
    ad_archive_id: adArchiveId,
    page_name: advertiserName,
    image_url: imageUrl,
    video_url: videoUrl,
    primary_text: primaryText,
    ad_start_date: startDate,
    ad_end_date: endDate,
    is_active: isActive,
    link_url: linkUrl,
    cta_text: ctaText,
    ad_source: "google",
    raw: it,
  };
}

function ok(data: any) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function bad(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function classifyAds(supa: any, client_slug: string, run_id: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    console.warn("LOVABLE_API_KEY chybí, přeskakuji klasifikaci");
    return;
  }

  const { data: ads, error } = await supa
    .from("competitor_ads")
    .select("id, primary_text, cta_text, image_url, page_name")
    .eq("client_slug", client_slug)
    .eq("scrape_run_id", run_id)
    .is("ad_type", null);
  if (error || !ads?.length) return;

  const BATCH_SIZE = 5;
  for (let i = 0; i < ads.length; i += BATCH_SIZE) {
    const batch = ads.slice(i, i + BATCH_SIZE);
    try {
      const userContent: any[] = [];
      batch.forEach((ad: any, idx: number) => {
        userContent.push({
          type: "text",
          text: `--- Reklama ${idx + 1} ---\nStránka: ${ad.page_name || "?"}\nCTA: ${ad.cta_text || "—"}\nText: ${(ad.primary_text || "—").slice(0, 300)}`,
        });
        if (ad.image_url) userContent.push({ type: "image_url", image_url: { url: ad.image_url } });
      });

      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: "Jsi seniorní marketingový stratég. Klasifikuj každou reklamu podle jejího primárního záměru: brand = budování značky a povědomí bez konkrétní nabídky; sales = přímá konverze — produkt, cena, sleva, silné CTA; retargeting = připomenutí a personalizace pro lidi, kteří značku znají (opuštěný košík, 'vraťte se'). Zavolej classify_batch.",
            },
            { role: "user", content: userContent },
          ],
          tools: [{
            type: "function",
            function: {
              name: "classify_batch",
              description: "Vrátí klasifikaci pro všechny reklamy v pořadí",
              parameters: {
                type: "object",
                properties: {
                  results: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { ad_type: { type: "string", enum: ["brand", "sales", "retargeting"] } },
                      required: ["ad_type"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["results"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "classify_batch" } },
        }),
      });

      if (!res.ok) { console.error("classify batch error", res.status); continue; }
      const d = await res.json();
      const args = d?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) continue;
      const results: { ad_type: string }[] = JSON.parse(args)?.results || [];
      await Promise.all(
        batch.map(async (ad: any, idx: number) => {
          const t = results[idx]?.ad_type;
          if (t === "brand" || t === "sales" || t === "retargeting") {
            await supa.from("competitor_ads").update({ ad_type: t }).eq("id", ad.id);
          }
        })
      );
    } catch (e) { console.error("classify batch err", e); }
  }
}