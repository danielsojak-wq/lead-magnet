import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APIFY_META_ACTOR = "apify~facebook-ads-scraper";

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

// ─── Apify helpers ────────────────────────────────────────────────────────────

async function startApifyRun(token: string, metaUrl: string): Promise<string | null> {
  const res = await fetch(
    `https://api.apify.com/v2/acts/${APIFY_META_ACTOR}/runs?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startUrls: [{ url: metaUrl }],
        resultsLimit: 50,
        activeStatus: "active",
      }),
    },
  );
  if (!res.ok) {
    console.error("Apify start failed:", res.status, await res.text());
    return null;
  }
  const d = await res.json();
  return d?.data?.id ?? null;
}

async function pollApifyRun(token: string, runId: string, timeoutMs = 300_000): Promise<any[] | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 15_000));
    const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`);
    const statusData = await statusRes.json();
    const status: string = statusData?.data?.status ?? "";
    const datasetId: string = statusData?.data?.defaultDatasetId ?? "";

    if (status === "RUNNING" || status === "READY") continue;
    if (status !== "SUCCEEDED") {
      console.error("Apify run failed with status:", status);
      return null;
    }

    const itemsRes = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&clean=true&format=json`,
    );
    return await itemsRes.json() as any[];
  }
  console.error("Apify polling timed out");
  return null;
}

function mapMetaItem(it: any, sessionId: string, competitorId: string) {
  const snapshot = it?.snapshot || it;
  const toDate = (v: any): string | null => {
    if (!v) return null;
    const n = typeof v === "number" ? v * (v < 1e12 ? 1000 : 1) : Date.parse(v);
    if (!n || isNaN(n)) return null;
    return new Date(n).toISOString().slice(0, 10);
  };
  const images = snapshot?.images || it?.images || [];
  const cards = snapshot?.cards || it?.cards || [];
  const videos = snapshot?.videos || it?.videos || [];
  const firstImg = images[0]?.originalImageUrl || images[0]?.resizedImageUrl ||
    cards.find((c: any) => c.originalImageUrl || c.resizedImageUrl)?.originalImageUrl || null;
  const firstVid = videos[0]?.videoHdUrl || videos[0]?.videoSdUrl || null;
  return {
    session_id: sessionId,
    competitor_id: competitorId,
    ad_source: "meta",
    ad_archive_id: String(it?.ad_archive_id || it?.adArchiveID || it?.id || crypto.randomUUID()),
    image_url: firstImg,
    video_url: firstVid,
    primary_text: snapshot?.body?.text || snapshot?.title || it?.primary_text || null,
    is_active: it?.is_active ?? true,
    ad_start_date: toDate(it?.start_date || it?.startDate || snapshot?.creation_time),
    ad_type: null,
  };
}

// ─── Classify ads via Lovable AI ──────────────────────────────────────────────

async function classifyAds(
  apiKey: string,
  supa: ReturnType<typeof admin>,
  sessionId: string,
  competitorId: string,
): Promise<void> {
  const { data: ads } = await supa
    .from("lm_session_ads")
    .select("id, primary_text, ad_archive_id")
    .eq("session_id", sessionId)
    .eq("competitor_id", competitorId)
    .is("ad_type", null);
  if (!ads?.length) return;

  const BATCH = 5;
  for (let i = 0; i < ads.length; i += BATCH) {
    const batch = ads.slice(i, i + BATCH);
    try {
      const userContent = batch.map((ad: any, idx: number) => ({
        type: "text",
        text: `--- Reklama ${idx + 1} ---\nText: ${(ad.primary_text || "—").slice(0, 300)}`,
      }));
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          max_tokens: 200,
          messages: [
            {
              role: "system",
              content: "Klasifikuj každou reklamu: brand = budování značky; sales = přímá konverze; retargeting = připomenutí. Zavolej classify_batch.",
            },
            { role: "user", content: userContent },
          ],
          tools: [{
            type: "function",
            function: {
              name: "classify_batch",
              parameters: {
                type: "object",
                properties: {
                  results: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { ad_type: { type: "string", enum: ["brand", "sales", "retargeting"] } },
                      required: ["ad_type"],
                    },
                  },
                },
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

// ─── Background pipeline ──────────────────────────────────────────────────────

async function runPipeline(
  sessionId: string,
  competitors: Array<{ id: string; url: string; meta_library_url: string | null }>,
  apifyToken: string,
  lovableApiKey: string,
): Promise<void> {
  const supa = admin();

  try {
    // Scrape each competitor that has a Meta URL
    await Promise.all(competitors.map(async (comp) => {
      if (!comp.meta_library_url) {
        console.log(`No Meta URL for competitor ${comp.id}, skipping scrape`);
        return;
      }

      const runId = await startApifyRun(apifyToken, comp.meta_library_url);
      if (!runId) {
        console.error(`Failed to start Apify run for competitor ${comp.id}`);
        return;
      }

      const items = await pollApifyRun(apifyToken, runId);
      if (!items?.length) {
        console.log(`No ads scraped for competitor ${comp.id}`);
        return;
      }

      const rows = items.map(it => mapMetaItem(it, sessionId, comp.id));
      const { error: upErr } = await supa
        .from("lm_session_ads")
        .upsert(rows, { onConflict: "session_id,ad_archive_id", ignoreDuplicates: false });
      if (upErr) console.error(`Upsert error for competitor ${comp.id}:`, upErr);
      else {
        await classifyAds(lovableApiKey, supa, sessionId, comp.id).catch(e =>
          console.error("classifyAds failed:", e)
        );
      }
    }));

    // Trigger AI analysis
    const analyzeUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/analyze-lm-session`;
    const analyzeRes = await fetch(analyzeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ session_id: sessionId }),
    });
    if (!analyzeRes.ok) {
      console.error("analyze-lm-session failed:", analyzeRes.status, await analyzeRes.text());
      await supa.from("lm_sessions").update({ status: "failed", error_message: "AI analysis failed" }).eq("id", sessionId);
    }
  } catch (e) {
    console.error("Pipeline error:", e);
    await supa.from("lm_sessions").update({
      status: "failed",
      error_message: String(e),
    }).eq("id", sessionId);
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { session_id, eshop_url, eshop_meta_url, competitors } = body as {
      session_id: string;
      eshop_url: string;
      eshop_meta_url?: string;
      competitors: Array<{ url: string; meta_url?: string; position: number }>;
    };

    if (!session_id) return err("session_id required");
    if (!eshop_url) return err("eshop_url required");
    if (!competitors?.length) return err("competitors required");

    const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN");
    if (!APIFY_TOKEN) return err("APIFY_API_TOKEN not configured", 500);
    const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_KEY) return err("LOVABLE_API_KEY not configured", 500);

    const supa = admin();

    // Update session with eshop data
    const { error: sessErr } = await supa
      .from("lm_sessions")
      .update({
        eshop_url,
        eshop_meta_library_url: eshop_meta_url || null,
        status: "processing",
      })
      .eq("id", session_id);
    if (sessErr) return err(sessErr.message, 500);

    // Upsert competitors
    const compRows: any[] = [];
    for (const c of competitors) {
      const { data: inserted, error: compErr } = await supa
        .from("lm_session_competitors")
        .upsert({
          session_id,
          position: c.position,
          url: c.url,
          meta_library_url: c.meta_url || null,
          status: "pending",
        }, { onConflict: "session_id,position" })
        .select()
        .single();
      if (compErr) { console.error("competitor upsert error:", compErr); continue; }
      compRows.push(inserted);
    }

    // Fire-and-forget background pipeline
    const bgTask = runPipeline(
      session_id,
      compRows.map(c => ({ id: c.id, url: c.url, meta_library_url: c.meta_library_url })),
      APIFY_TOKEN,
      LOVABLE_KEY,
    );
    // EdgeRuntime.waitUntil keeps the task alive after response is sent
    (globalThis as any).EdgeRuntime?.waitUntil?.(bgTask.catch(e => console.error("bg pipeline:", e)));

    return ok({ ok: true, session_id });
  } catch (e) {
    console.error("start-lm-analysis error:", e);
    return err((e as Error).message, 500);
  }
});
