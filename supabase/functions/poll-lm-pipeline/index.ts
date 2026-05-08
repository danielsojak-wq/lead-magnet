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
  const firstImg =
    images[0]?.originalImageUrl || images[0]?.resizedImageUrl ||
    cards.find((c: any) => c.originalImageUrl || c.resizedImageUrl)?.originalImageUrl || null;
  const firstVid = videos[0]?.videoHdUrl || videos[0]?.videoSdUrl || null;
  return {
    session_id:    sessionId,
    competitor_id: competitorId,
    ad_source:     "meta",
    ad_archive_id: String(it?.ad_archive_id || it?.adArchiveID || it?.id || crypto.randomUUID()),
    image_url:     firstImg,
    video_url:     firstVid,
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
): Promise<{ done: boolean; succeeded: boolean; datasetId: string; items: any[] }> {
  const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`);
  const statusData = await statusRes.json();
  const apifyStatus: string = statusData?.data?.status ?? "";
  const datasetId: string   = statusData?.data?.defaultDatasetId ?? "";

  console.log(`Apify run ${runId}: ${apifyStatus}`);

  if (apifyStatus === "RUNNING" || apifyStatus === "READY" || apifyStatus === "STARTING") {
    return { done: false, succeeded: false, datasetId, items: [] };
  }
  if (apifyStatus !== "SUCCEEDED") {
    return { done: true, succeeded: false, datasetId, items: [] };
  }
  const items = await downloadApifyDataset(token, datasetId);
  return { done: true, succeeded: true, datasetId, items };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const session_id = body.session_id as string | undefined;
    if (!session_id) return err("session_id required");

    const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN");
    const LOVABLE_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!APIFY_TOKEN) return err("APIFY_API_TOKEN not configured", 500);

    const supa = admin();

    // Fast-path: check session status
    const { data: session } = await supa
      .from("lm_sessions").select("status").eq("id", session_id).single();

    if (session?.status === "ready" || session?.status === "completed") return ok({ status: "ready" });
    if (session?.status === "analyzing") return ok({ status: "analyzing" });
    if (session?.status === "failed")    return ok({ status: "failed" });

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
      return ok({ status: "scraping" });
    }

    const scraping = comps.filter(c => c.status === "scraping");

    for (const comp of scraping) {
      let totalAds = 0;

      // Check Meta run
      if (comp.apify_run_id) {
        const { done, succeeded, items } = await checkAndProcessRun(APIFY_TOKEN, comp.apify_run_id);
        if (!done) continue;
        if (succeeded && items.length) {
          const rows = items.map(it => mapMetaItem(it, session_id, comp.id));
          await supa.from("lm_session_ads").upsert(rows, { onConflict: "session_id,ad_archive_id", ignoreDuplicates: false });
          totalAds = items.length;
          // classifyAds disabled — ad types assigned by analyze-lm-session L1
          // if (LOVABLE_KEY) await classifyAds(LOVABLE_KEY, supa, session_id, comp.id).catch(console.error);
          console.log(`Competitor ${comp.id}: saved ${items.length} Meta ads`);
        }
      }

      await supa.from("lm_session_competitors")
        .update({ status: "scraped", ads_count: totalAds })
        .eq("id", comp.id);
    }

    // Re-check for any still scraping
    const { data: freshComps } = await supa
      .from("lm_session_competitors").select("status").eq("session_id", session_id);

    if ((freshComps ?? []).some(c => c.status === "scraping")) {
      return ok({ status: "scraping" });
    }

    // All scraped → trigger AI (only once)
    const { data: freshSession } = await supa
      .from("lm_sessions").select("status").eq("id", session_id).single();

    if (freshSession?.status === "processing") {
      await supa.from("lm_sessions").update({ status: "analyzing" }).eq("id", session_id);
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
