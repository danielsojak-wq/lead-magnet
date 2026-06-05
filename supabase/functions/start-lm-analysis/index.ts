import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APIFY_META_ACTOR = "curious_coder~facebook-ads-library-scraper";

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

// Strip protocol/host/leading slashes so we get a bare FB vanity slug.
function normalizeFbSlug(slug: string): string {
  return slug
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^(www\.|m\.|web\.)?facebook\.com\//i, "")
    .replace(/^\/+/, "")
    .split(/[/?#]/)[0]
    .trim();
}

// Vytáhni view_all_page_id z uložené discovery meta_url (když ho discovery našla).
function pageIdFromMetaUrl(metaUrl: string | null | undefined): string | null {
  if (!metaUrl) return null;
  try { return new URL(metaUrl).searchParams.get("view_all_page_id"); } catch { return null; }
}

// Canonical Ads Library Page URL (view_all_page_id) — NEdělá FB redirect, takže
// se actor nezasekne na "Maximum redirect limit exceeded" jako u vanity URL.
function buildPageUrl(pageId: string): string {
  return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=CZ` +
    `&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=${pageId}`;
}

// Apify input URL — priorita:
//   1. page_id (z cache / discovery) → canonical view_all_page_id URL (bez redirectu, spolehlivé)
//   2. vanity slug → facebook.com/<slug> (flaky kvůli FB redirectu, ale lepší než q=)
//   3. q= fallback (uložená Ads Library URL — jako fieldmann bez slugu)
function apifyTargetUrl(pageId: string | null | undefined, fbSlug: string | null | undefined, fallbackMetaUrl: string | null): string | null {
  if (pageId) return buildPageUrl(pageId);
  const slug = fbSlug ? normalizeFbSlug(fbSlug) : "";
  if (slug) return `https://www.facebook.com/${slug}`;
  return fallbackMetaUrl;
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
    const { session_id } = body as { session_id: string };

    if (!session_id) return err("session_id required");

    // Allow callers to pass URL data directly (legacy / admin use),
    // or omit it so we read from the stored session (new flow).
    let eshop_url: string | undefined = body.eshop_url;
    let eshop_meta_url: string | undefined = body.eshop_meta_url;
    let eshop_fb_slug: string | undefined = body.eshop_fb_slug;
    let competitors: Array<{ url: string; meta_url?: string; fb_slug?: string; position: number }> | undefined = body.competitors;

    const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN");
    if (!APIFY_TOKEN) return err("APIFY_API_TOKEN not configured", 500);

    const supa = admin();

    // If URL data was not provided, read it from the stored session
    if (!eshop_url || !competitors?.length) {
      const { data: session, error: sessErr } = await supa
        .from("lm_sessions")
        .select("eshop_url, eshop_meta_library_url, eshop_fb_slug")
        .eq("id", session_id)
        .single();

      if (sessErr || !session) return err(sessErr?.message ?? "Session not found", 404);
      if (!session.eshop_url) return err("eshop_url not stored in session", 400);

      eshop_url = session.eshop_url;
      eshop_meta_url = session.eshop_meta_library_url ?? undefined;
      eshop_fb_slug = session.eshop_fb_slug ?? undefined;

      const { data: dbComps } = await supa
        .from("lm_session_competitors")
        .select("url, meta_library_url, fb_slug, position")
        .eq("session_id", session_id)
        .gt("position", 0)
        .order("position");

      competitors = (dbComps ?? []).map((c) => ({
        url: c.url,
        meta_url: c.meta_library_url ?? undefined,
        fb_slug: c.fb_slug ?? undefined,
        position: c.position,
      }));

      if (!competitors.length) return err("No competitors stored in session", 400);
    }

    await supa.from("lm_sessions").update({
      eshop_url,
      eshop_meta_library_url: eshop_meta_url || null,
      status: "processing",
    }).eq("id", session_id);

    // Clear previous run data (handles resubmit edge cases)
    await supa.from("lm_session_competitors").delete().eq("session_id", session_id);
    await supa.from("lm_session_ads").delete().eq("session_id", session_id);

    // page_id cache lookup — domény s historií scrapujeme přes canonical
    // view_all_page_id URL (bez vanity redirectu). Jeden dotaz pro všechny domény.
    const lookupDomains = [extractDomain(eshop_url), ...competitors.map(c => extractDomain(c.url))]
      .filter((d): d is string => !!d);
    const pageIdByDomain = new Map<string, string>();
    if (lookupDomains.length) {
      const { data: cacheRows } = await supa
        .from("lm_page_id_cache").select("domain, page_id").in("domain", lookupDomains);
      for (const r of cacheRows ?? []) pageIdByDomain.set(r.domain as string, r.page_id as string);
    }

    // Eshop as position 0 — prefer canonical page_id URL > vanity slug > q=
    const eshopLog: string[] = [];
    const eshopMeta   = eshop_meta_url?.trim() || null;
    const eshopSlug   = eshop_fb_slug?.trim() || null;
    const eshopPageId = pageIdByDomain.get(extractDomain(eshop_url) ?? "") ?? pageIdFromMetaUrl(eshopMeta);
    const eshopTarget = apifyTargetUrl(eshopPageId, eshopSlug, eshopMeta);
    if (eshopTarget) {
      const { data: eshopRow } = await supa
        .from("lm_session_competitors")
        .upsert({ session_id, position: 0, url: eshop_url, meta_library_url: eshopMeta, fb_slug: eshopSlug, status: "pending" }, { onConflict: "session_id,position" })
        .select().single();
      if (eshopRow) {
        const { runId, error: runErr } = await startApifyRun(APIFY_TOKEN, APIFY_META_ACTOR, {
          urls: [{ url: eshopTarget }],
          limitPerSource: 50,
          "scrapePageAds.activeStatus": "active",
        });
        const mode = eshopPageId ? "page_id" : eshopSlug ? "vanity" : "q";
        if (runId) {
          await supa.from("lm_session_competitors").update({ apify_run_id: runId, status: "scraping" }).eq("id", eshopRow.id);
          eshopLog.push(`eshop_meta[${mode}]=${runId}`);
        } else {
          await supa.from("lm_session_competitors").update({ status: "scraped", ads_count: 0 }).eq("id", eshopRow.id);
          eshopLog.push(`eshop_meta[${mode}]=FAILED: ${runErr}`);
        }
      }
    }

    const runLogs = await Promise.all(competitors.map(async (c) => {
      const metaUrl = c.meta_url?.trim() || null;
      const fbSlug  = c.fb_slug?.trim() || null;
      const domain  = extractDomain(c.url);

      const { data: inserted, error: compErr } = await supa
        .from("lm_session_competitors")
        .upsert({
          session_id,
          position: c.position,
          url: c.url,
          meta_library_url: metaUrl,
          fb_slug: fbSlug,
          status: "pending",
        }, { onConflict: "session_id,position" })
        .select()
        .single();

      if (compErr || !inserted) {
        console.error("competitor upsert error:", compErr);
        return { url: c.url, log: "upsert_failed" };
      }

      const updates: Record<string, unknown> = {};
      const log: string[] = [];

      // Prefer canonical page_id URL (cache) > vanity slug > q= keyword.
      const compPageId = pageIdByDomain.get(domain ?? "") ?? pageIdFromMetaUrl(metaUrl);
      const targetUrl = apifyTargetUrl(compPageId, fbSlug, metaUrl);

      if (targetUrl) {
        const { runId: metaRunId, error: metaErr } = await startApifyRun(APIFY_TOKEN, APIFY_META_ACTOR, {
          urls: [{ url: targetUrl }],
          limitPerSource: 50,
          "scrapePageAds.activeStatus": "active",
        });
        const mode = compPageId ? "page_id" : fbSlug ? "vanity" : "q";
        if (metaRunId) { updates.apify_run_id = metaRunId; log.push(`meta[${mode}]=${metaRunId}`); }
        else log.push(`meta[${mode}]=FAILED: ${metaErr}`);
      } else log.push("meta=no_url");

      if (domain) log.push(`google=link_only:${domain}`);

      if (updates.apify_run_id) {
        updates.status = "scraping";
      } else {
        updates.status = "scraped";
        updates.ads_count = 0;
      }
      await supa.from("lm_session_competitors").update(updates).eq("id", inserted.id);

      console.log(`Competitor ${inserted.id} (${c.url}): ${log.join(" | ")}`);
      return { url: c.url, log: log.join(" | ") };
    }));

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
