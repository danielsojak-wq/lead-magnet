import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const sessionId = body.session_id as string | undefined;
    if (!sessionId) return err("session_id required");

    const supa = admin();

    const { data: session, error: sessionErr } = await supa
      .from("lm_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionErr) throw sessionErr;
    if (!session) return err("session not found", 404);

    // Not yet ready to show anything meaningful
    if (session.status === "email_pending" || session.status === "urls_pending") {
      return ok({
        status: session.status,
        eshop_name: session.eshop_name ?? "Váš e-shop",
        competitors: [],
        cross_summary: null,
      });
    }

    const { data: competitors, error: compErr } = await supa
      .from("lm_session_competitors")
      .select("*")
      .eq("session_id", sessionId)
      .order("position");

    if (compErr) throw compErr;

    const competitorIds = (competitors ?? []).map((c: any) => c.id as string);

    const { data: allAds, error: adsErr } = competitorIds.length > 0
      ? await supa
          .from("lm_session_ads")
          .select("*")
          .in("competitor_id", competitorIds)
          .order("created_at", { ascending: false })
      : { data: [] as any[], error: null };

    if (adsErr) throw adsErr;

    const adsByCompetitor = new Map<string, any[]>();
    for (const ad of (allAds ?? [])) {
      const list = adsByCompetitor.get(ad.competitor_id) ?? [];
      list.push(ad);
      adsByCompetitor.set(ad.competitor_id, list);
    }

    const mappedCompetitors = (competitors ?? []).map((c: any) => ({
      id: c.id,
      name: c.name ?? c.url,
      website_url: c.url,
      summary: c.summary ?? null,
      ai_analysis: c.ai_analysis ?? null,
      status: c.status as "ready" | "processing" | "failed" | "empty" | "scrape_failed",
      ads_count: c.ads_count,
      ad_mix: c.ad_mix ?? { brand: 0, sales: 0, retargeting: 0 },
      ads: (adsByCompetitor.get(c.id) ?? []).slice(0, 18).map((a: any) => ({
        id: a.id,
        image_url: a.image_url ?? null,
        video_url: a.video_url ?? null,
        primary_text: a.primary_text ?? null,
        ad_type: a.ad_type ?? null,
        ad_source: a.ad_source as "meta" | "google",
        is_active: a.is_active,
        ad_start_date: a.ad_start_date ?? null,
      })),
    }));

    return ok({
      status: session.status as string,
      eshop_name: session.eshop_name ?? "Váš e-shop",
      competitors: mappedCompetitors,
      cross_summary: session.cross_summary ?? null,
      ai_cross_analysis: session.ai_cross_analysis ?? null,
    });
  } catch (e) {
    console.error(e);
    return err((e as Error).message, 500);
  }
});
