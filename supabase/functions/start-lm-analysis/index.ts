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

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function startApifyRun(token: string, actor: string, input: unknown): Promise<{ runId: string | null; error?: string }> {
  const res = await fetch(
    `https://api.apify.com/v2/acts/${actor}/runs?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    console.error(`Apify start failed (${actor}):`, res.status, body);
    return { runId: null, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
  }
  const d = await res.json();
  const runId = d?.data?.id ?? null;
  console.log(`Apify run started (${actor}): ${runId}`);
  return { runId };
}

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

    const supa = admin();

    await supa.from("lm_sessions").update({
      eshop_url,
      eshop_meta_library_url: eshop_meta_url || null,
      status: "processing",
    }).eq("id", session_id);

    const runLogs: { url: string; log: string }[] = [];

    for (const c of competitors) {
      const metaUrl = c.meta_url?.trim() || null;
      const domain  = extractDomain(c.url);

      const { data: inserted, error: compErr } = await supa
        .from("lm_session_competitors")
        .upsert({
          session_id,
          position: c.position,
          url: c.url,
          meta_library_url: metaUrl,
          status: "pending",
        }, { onConflict: "session_id,position" })
        .select()
        .single();

      if (compErr || !inserted) {
        console.error("competitor upsert error:", compErr);
        continue;
      }

      const updates: Record<string, unknown> = {};
      const log: string[] = [];

      // Meta Ads run
      if (metaUrl) {
        const { runId: metaRunId, error: metaErr } = await startApifyRun(APIFY_TOKEN, APIFY_META_ACTOR, {
          startUrls: [{ url: metaUrl }],
          resultsLimit: 50,
          activeStatus: "active",
        });
        if (metaRunId) { updates.apify_run_id = metaRunId; log.push(`meta=${metaRunId}`); }
        else log.push(`meta=FAILED: ${metaErr}`);
      } else log.push("meta=no_url");

      // Google Ads: not scraped automatically — link shown in UI
      if (domain) log.push(`google=link_only:${domain}`);

      if (Object.keys(updates).length) {
        updates.status = "scraping";
        await supa.from("lm_session_competitors").update(updates).eq("id", inserted.id);
      }

      console.log(`Competitor ${inserted.id} (${c.url}): ${log.join(" | ")}`);
      runLogs.push({ url: c.url, log: log.join(" | ") });
    }

    // Re-read competitors to confirm what was saved
    const { data: savedComps } = await supa
      .from("lm_session_competitors")
      .select("url, status, apify_run_id, apify_google_run_id")
      .eq("session_id", session_id);

    return ok({ ok: true, session_id, runLogs, competitors: savedComps });
  } catch (e) {
    console.error("start-lm-analysis error:", e);
    return err((e as Error).message, 500);
  }
});
