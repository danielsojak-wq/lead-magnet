import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function ok(p: any) {
  return new Response(JSON.stringify(p), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function bad(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) return bad("FIRECRAWL_API_KEY není nastaven (zapni Firecrawl konektor)", 500);

    const body = await req.json().catch(() => ({}));
    const { action, competitor_id } = body || {};
    if (!competitor_id) return bad("competitor_id je povinné");

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (action === "get") {
      const { data, error } = await supa
        .from("competitor_website_cache")
        .select("scraped_at, summary, url")
        .eq("competitor_id", competitor_id)
        .maybeSingle();
      if (error) return bad(error.message, 500);
      return ok({ cache: data || null });
    }

    if (action === "scrape") {
      // Načti competitor a jeho website_url
      const { data: comp, error: cErr } = await supa
        .from("competitors")
        .select("id, client_slug, website_url, name")
        .eq("id", competitor_id)
        .maybeSingle();
      if (cErr || !comp) return bad("Konkurent nenalezen", 404);
      if (!comp.website_url) return bad("Konkurent nemá vyplněný web");

      // Firecrawl scrape
      const r = await fetch(`${FIRECRAWL_V2}/scrape`, {
        method: "POST",
        headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          url: comp.website_url,
          formats: ["markdown", "summary"],
          onlyMainContent: true,
        }),
      });
      const fdata = await r.json();
      if (!r.ok) {
        console.error("Firecrawl error:", r.status, fdata);
        return bad(`Firecrawl ${r.status}: ${fdata?.error || "scrape selhal"}`, 502);
      }

      const markdown = (fdata?.markdown || fdata?.data?.markdown || "") as string;
      const summary = (fdata?.summary || fdata?.data?.summary || "") as string;
      const trimmedMd = markdown.slice(0, 20000);
      const trimmedSummary = (summary || markdown.slice(0, 2000)).slice(0, 4000);

      const { error: upErr } = await supa
        .from("competitor_website_cache")
        .upsert(
          {
            competitor_id: comp.id,
            client_slug: comp.client_slug,
            url: comp.website_url,
            markdown: trimmedMd,
            summary: trimmedSummary,
            scraped_at: new Date().toISOString(),
          },
          { onConflict: "competitor_id" },
        );
      if (upErr) return bad(upErr.message, 500);

      return ok({
        ok: true,
        scraped_at: new Date().toISOString(),
        has_content: !!trimmedMd,
        summary: trimmedSummary,
      });
    }

    return bad("Neznámá akce");
  } catch (e: any) {
    console.error("scrape-competitor-website error:", e);
    return bad(e?.message || String(e), 500);
  }
});