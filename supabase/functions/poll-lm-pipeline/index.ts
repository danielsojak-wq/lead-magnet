import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}
function ok(d: unknown) {
  return new Response(JSON.stringify(d), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function err(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ─── Ad mappers ───────────────────────────────────────────────────────────────

function mapMetaItem(it: any, sessionId: string, competitorId: string) {
  const snapshot = it?.snapshot || it;
  const toDate = (v: any): string | null => {
    if (!v) return null;
    const n = typeof v === "number" ? v * (v < 1e12 ? 1000 : 1) : Date.parse(v);
    if (!n || isNaN(n)) return null;
    return new Date(n).toISOString().slice(0, 10);
  };
  const images = snapshot?.images || it?.images || [];
  const cards  = snapshot?.cards  || it?.cards  || [];
  const videos = snapshot?.videos || it?.videos || [];
  const cardWithImg = cards.find((c: any) =>
    c.original_image_url || c.originalImageUrl || c.resized_image_url || c.resizedImageUrl
  );
  const firstImg =
    images[0]?.originalImageUrl || images[0]?.original_image_url ||
    images[0]?.resizedImageUrl  || images[0]?.resized_image_url  ||
    cardWithImg?.original_image_url || cardWithImg?.originalImageUrl ||
    cardWithImg?.resized_image_url  || cardWithImg?.resizedImageUrl  || null;
  const cardWithVid = cards.find((c: any) =>
    c.video_hd_url || c.videoHdUrl || c.video_sd_url || c.videoSdUrl
  );
  const firstVid =
    videos[0]?.videoHdUrl  || videos[0]?.video_hd_url  ||
    videos[0]?.videoSdUrl  || videos[0]?.video_sd_url  ||
    cardWithVid?.video_hd_url || cardWithVid?.videoHdUrl ||
    cardWithVid?.video_sd_url || cardWithVid?.videoSdUrl || null;
  const adFormat: string =
    videos.length > 0 || !!cardWithVid ? "video" :
    cards.length > 1 ? "carousel" : "single_image";
  return {
    session_id:    sessionId,
    competitor_id: competitorId,
    ad_source:     "meta",
    ad_archive_id: String(it?.ad_archive_id || it?.adArchiveID || it?.id || crypto.randomUUID()),
    image_url:     firstImg,
    video_url:     firstVid,
    format:        adFormat,
    primary_text:  snapshot?.body?.text || snapshot?.title || it?.primary_text || null,
    is_active:     it?.is_active ?? true,
    ad_start_date: toDate(it?.start_date || it?.startDate || snapshot?.creation_time),
    ad_type:       null,
  };
}

// ─── Classify ads ─────────────────────────────────────────────────────────────

async function classifyAds(apiKey: string, supa: ReturnType<typeof admin>, sessionId: string, competitorId: string) {
  const { data: ads } = await supa
    .from("lm_session_ads")
    .select("id, primary_text")
    .eq("session_id", sessionId)
    .eq("competitor_id", competitorId)
    .is("ad_type", null);
  if (!ads?.length) return;

  const BATCH = 5;
  for (let i = 0; i < ads.length; i += BATCH) {
    const batch = ads.slice(i, i + BATCH);
    try {
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          max_tokens: 200,
          messages: [
            { role: "system", content: "Klasifikuj každou reklamu: brand = budování značky; sales = přímá konverze; retargeting = připomenutí. Zavolej classify_batch." },
            { role: "user", content: batch.map((ad: any, idx: number) => ({ type: "text", text: `--- Reklama ${idx + 1} ---\nText: ${(ad.primary_text || "—").slice(0, 300)}` })) },
          ],
          tools: [{
            type: "function",
            function: {
              name: "classify_batch",
              parameters: {
                type: "object",
                properties: { results: { type: "array", items: { type: "object", properties: { ad_type: { type: "string", enum: ["brand", "sales", "retargeting"] } }, required: ["ad_type"] } } },
                required: ["results"],
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "classify_batch" } },
        }),
      });
      if (!res.ok) continue;
      const d = await res.json();
      const args = d?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) continue;
      const results: { ad_type: string }[] = JSON.parse(args)?.results ?? [];
      await Promise.all(batch.map(async (ad: any, idx: number) => {
        const t = results[idx]?.ad_type;
        if (t === "brand" || t === "sales" || t === "retargeting") {
          await supa.from("lm_session_ads").update({ ad_type: t }).eq("id", ad.id);
        }
      }));
    } catch (e) {
      console.error("classify batch error:", e);
    }
  }
}

// ─── Download one Apify dataset ───────────────────────────────────────────────

async function downloadApifyDataset(token: string, datasetId: string): Promise<any[]> {
  const res = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&clean=true&format=json`,
  );
  if (!res.ok) return [];
  return await res.json() as any[];
}

async function checkAndProcessRun(
  token: string,
  runId: string,
): Promise<{ done: boolean; succeeded: boolean; datasetId: string; items: any[]; creditExhausted: boolean }> {
  const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`);
  const statusData = await statusRes.json();
  const apifyStatus: string  = statusData?.data?.status ?? "";
  const statusMessage: string = (statusData?.data?.statusMessage ?? "").toLowerCase();
  const datasetId: string    = statusData?.data?.defaultDatasetId ?? "";

  const creditExhausted = statusMessage.includes("maximum charged") || statusMessage.includes("charged results");

  console.log(`Apify run ${runId}: ${apifyStatus} — ${statusData?.data?.statusMessage ?? ""}`);

  if (apifyStatus === "RUNNING" || apifyStatus === "READY" || apifyStatus === "STARTING") {
    return { done: false, succeeded: false, datasetId, items: [], creditExhausted: false };
  }
  if (apifyStatus !== "SUCCEEDED") {
    return { done: true, succeeded: false, datasetId, items: [], creditExhausted };
  }
  const items = await downloadApifyDataset(token, datasetId);
  return { done: true, succeeded: true, datasetId, items, creditExhausted };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const session_id = body.session_id as string | undefined;
    if (!session_id) return err("session_id required");

    const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN");
    if (!APIFY_TOKEN) return err("APIFY_API_TOKEN not configured", 500);

    const supa = admin();

    // Fast-path: check session status
    const { data: session } = await supa
      .from("lm_sessions").select("status, error_message").eq("id", session_id).single();

    if (session?.status === "ready" || session?.status === "completed") return ok({ status: "ready" });
    if (session?.status === "failed") return ok({ status: "failed", error_message: session.error_message ?? null });

    // Recovery: if stuck in "analyzing" for more than 8 minutes with no result, reset
    if (session?.status === "analyzing") {
      const { data: fullSession } = await supa
        .from("lm_sessions").select("analyzing_started_at, ai_cross_analysis").eq("id", session_id).single();
      const startedAt = fullSession?.analyzing_started_at ? new Date(fullSession.analyzing_started_at).getTime() : 0;
      const hasResult = fullSession?.ai_cross_analysis != null;
      const stuckTooLong = !hasResult && startedAt > 0 && (Date.now() - startedAt > 15 * 60 * 1000);
      if (stuckTooLong) {
        console.warn(`Session ${session_id} stuck in analyzing with no result, resetting to processing`);
        await supa.from("lm_sessions").update({ status: "processing" }).eq("id", session_id);
        // Fall through to re-trigger analysis below
      } else {
        return ok({ status: "analyzing" });
      }
    }

    // Load all competitors
    const { data: competitors } = await supa
      .from("lm_session_competitors")
      .select("id, url, apify_run_id, apify_google_run_id, status")
      .eq("session_id", session_id);

    const comps = competitors ?? [];

    // Advance "pending" competitors with no Apify run to "scraped" so the pipeline doesn't block forever
    for (const comp of comps.filter(c => c.status === "pending" && !c.apify_run_id)) {
      await supa.from("lm_session_competitors")
        .update({ status: "scraped", ads_count: 0 })
        .eq("id", comp.id);
      comp.status = "scraped";
    }

    // If any competitor is still pending (Apify not yet started), report scraping
    if (comps.some(c => c.status === "pending")) {
      const scraped = comps.filter(c => c.status === "scraped" || c.status === "scrape_failed").length;
      return ok({ status: "scraping", scraped, total: comps.length });
    }

    const scraping = comps.filter(c => c.status === "scraping");

    for (const comp of scraping) {
      let totalAds = 0;
      let scrapeStatus = "scraped";

      // Check Meta run
      if (comp.apify_run_id) {
        const { done, succeeded, items, creditExhausted } = await checkAndProcessRun(APIFY_TOKEN, comp.apify_run_id);
        if (!done) continue;
        if (creditExhausted) {
          console.error(`Competitor ${comp.id}: Apify credit exhausted`);
          await supa.from("lm_sessions").update({
            status: "failed",
            error_message: "apify_credit_exhausted",
          }).eq("id", session_id);
          return ok({ status: "failed", error_message: "apify_credit_exhausted" });
        }
        if (succeeded) {
          if (items.length) {
            const rows = items.map(it => mapMetaItem(it, session_id, comp.id));
            await supa.from("lm_session_ads").upsert(rows, { onConflict: "session_id,ad_archive_id", ignoreDuplicates: false });
            totalAds = items.length;
            console.log(`Competitor ${comp.id}: saved ${items.length} Meta ads`);
          }
        } else {
          scrapeStatus = "scrape_failed";
          console.warn(`Competitor ${comp.id}: Apify run failed`);
        }
      }

      await supa.from("lm_session_competitors")
        .update({ status: scrapeStatus, ads_count: totalAds })
        .eq("id", comp.id);
    }

    // Re-check for any still scraping
    const { data: freshComps } = await supa
      .from("lm_session_competitors").select("status").eq("session_id", session_id);

    const fc = freshComps ?? [];
    if (fc.some(c => c.status === "scraping" || c.status === "pending")) {
      const scraped = fc.filter(c => c.status === "scraped" || c.status === "scrape_failed").length;
      return ok({ status: "scraping", scraped, total: fc.length });
    }

    // All scraped → trigger AI (only once)
    const { data: freshSession } = await supa
      .from("lm_sessions").select("status").eq("id", session_id).single();

    if (freshSession?.status === "processing") {
      await supa.from("lm_sessions").update({ status: "analyzing", analyzing_started_at: new Date().toISOString() }).eq("id", session_id);
      const analyzeUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/analyze-lm-session`;
      await fetch(analyzeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
        body: JSON.stringify({ session_id }),
      }).catch(e => console.error("analyze-lm-session trigger failed:", e));
    }

    return ok({ status: "analyzing" });
  } catch (e) {
    console.error("poll-lm-pipeline error:", e);
    return err((e as Error).message, 500);
  }
});
