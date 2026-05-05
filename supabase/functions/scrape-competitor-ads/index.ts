import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APIFY_ACTOR = "apify~facebook-ads-scraper";

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
      const { client_slug, library_url, created_by_email, max_ads, competitor_id, active_only } = body;
      if (!client_slug || !library_url) return bad("client_slug a library_url jsou povinné");
      if (!competitor_id) return bad("competitor_id je povinné");

      // Normalize Meta Ad Library URL — accept bare query strings, page IDs, or full URLs
      const normalizeMetaUrl = (raw: string): string | null => {
        const s = String(raw || "").trim();
        if (!s) return null;
        // Already a valid http(s) URL
        if (/^https?:\/\//i.test(s)) {
          try { new URL(s); return s; } catch { return null; }
        }
        // Bare page ID (digits only)
        if (/^\d+$/.test(s)) {
          return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=CZ&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=${s}`;
        }
        // Query string fragment — extract view_all_page_id and rebuild
        const m = s.match(/view_all_page_id=(\d+)/);
        if (m) {
          const qs = s.replace(/^[?&=]+/, "");
          return `https://www.facebook.com/ads/library/?${qs}`;
        }
        return null;
      };
      const normalizedUrl = normalizeMetaUrl(library_url);
      if (!normalizedUrl) {
        return bad("Neplatná Meta Ad Library URL — vlož celý odkaz z Meta Ad Library (https://www.facebook.com/ads/library/?...)", 400);
      }

      // Spustit Apify actor asynchronně
      const startRes = await fetch(
        `https://api.apify.com/v2/acts/${APIFY_ACTOR}/runs?token=${APIFY_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startUrls: [{ url: normalizedUrl }],
            resultsLimit: Math.min(Number(max_ads) || 50, 200),
            activeStatus: active_only === false ? "" : "active",
          }),
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

      const rows = items.map((it) => mapApifyItem(it, runRow.client_slug, run_id));
      // Inject competitor_id from run
      const compId = (runRow as any).competitor_id;
      if (compId) for (const r of rows) (r as any).competitor_id = compId;

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

  // Klasifikuj všechny reklamy z tohoto runu, které ještě nemají ad_type
  const { data: ads, error } = await supa
    .from("competitor_ads")
    .select("id, primary_text, cta_text, image_url, page_name")
    .eq("client_slug", client_slug)
    .eq("scrape_run_id", run_id)
    .is("ad_type", null);
  if (error || !ads?.length) return;

  // Paralelně, ale s limitem aby nepřetížilo gateway
  const concurrency = 4;
  for (let i = 0; i < ads.length; i += concurrency) {
    const batch = ads.slice(i, i + concurrency);
    await Promise.all(batch.map(async (ad: any) => {
      const label = await classifyOne(ad, LOVABLE_API_KEY);
      if (label) {
        await supa.from("competitor_ads").update({ ad_type: label }).eq("id", ad.id);
      }
    }));
  }
}

async function classifyOne(ad: any, apiKey: string): Promise<string | null> {
  const userContent: any[] = [
    {
      type: "text",
      text: `Klasifikuj tuto Facebook/Instagram reklamu do jedné z kategorií: "brand", "sales", "retargeting".

Pravidla:
- "brand" = budování značky, příběh, hodnoty, žádná konkrétní cena/sleva, obecná osvěta.
- "sales" = konkrétní produkt/nabídka, cena, sleva, akce, "kup teď", silná CTA.
- "retargeting" = připomenutí (opuštěný košík, "zapomněli jste", "vraťte se"), personalizovaná komunikace návštěvníkům webu.

Stránka: ${ad.page_name || "?"}
CTA tlačítko: ${ad.cta_text || "—"}
Text reklamy: ${ad.primary_text || "—"}`,
    },
  ];
  if (ad.image_url) {
    userContent.push({ type: "image_url", image_url: { url: ad.image_url } });
  }

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Jsi expert na klasifikaci reklam. Vždy zavoláš funkci classify_ad." },
          { role: "user", content: userContent },
        ],
        tools: [{
          type: "function",
          function: {
            name: "classify_ad",
            description: "Vrátí kategorii reklamy",
            parameters: {
              type: "object",
              properties: {
                ad_type: { type: "string", enum: ["brand", "sales", "retargeting"] },
              },
              required: ["ad_type"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "classify_ad" } },
      }),
    });
    if (!res.ok) {
      console.error("AI gateway error", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return null;
    const parsed = JSON.parse(args);
    const t = parsed?.ad_type;
    if (t === "brand" || t === "sales" || t === "retargeting") return t;
    return null;
  } catch (e) {
    console.error("classifyOne error", e);
    return null;
  }
}