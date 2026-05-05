import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const amId: string | null = body?.am_id || null;

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve allowed slugs for AM
    let allowedSlugs: Set<string> | null = null;
    if (amId) {
      const { data: amc } = await supa
        .from("account_manager_clients")
        .select("client_slug")
        .eq("account_manager_id", amId);
      allowedSlugs = new Set((amc || []).map((r: any) => r.client_slug));
    }

    // For admin view, resolve AM assignments per client
    const slugToAms = new Map<string, string[]>();
    if (!amId) {
      const [{ data: amRows }, { data: amcRows }] = await Promise.all([
        supa.from("account_managers").select("id, display_name"),
        supa.from("account_manager_clients").select("account_manager_id, client_slug").in("section", ["leadgen", "ecommerce"]),
      ]);
      const amNameMap = new Map<string, string>();
      for (const am of (amRows || [])) {
        amNameMap.set(am.id, am.display_name || "Neznámý");
      }
      for (const amc of (amcRows || [])) {
        const name = amNameMap.get(amc.account_manager_id);
        if (!name) continue;
        const existing = slugToAms.get(amc.client_slug) || [];
        if (!existing.includes(name)) existing.push(name);
        slugToAms.set(amc.client_slug, existing);
      }
    }

    const { data: clients, error: cErr } = await supa
      .from("clients")
      .select("id, slug, name, display_name");
    if (cErr) throw cErr;

    let list = (clients || []).map((c: any) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      display_name: c.display_name,
    }));
    if (allowedSlugs) list = list.filter((c) => allowedSlugs!.has(c.slug));

    if (list.length === 0) {
      return new Response(JSON.stringify({ clients: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ids = list.map((c) => c.id);
    const slugs = list.map((c) => c.slug);

    const [sourcesRes, brandRes, briefsRes] = await Promise.all([
      supa.from("client_data_sources").select("client_id, source_type").in("client_id", ids),
      supa.from("creative_brand_profiles").select("client_slug").in("client_slug", slugs),
      supa.from("creative_briefs").select("client_slug").in("client_slug", slugs),
    ]);

    const byClientSrc = new Map<string, Set<string>>();
    for (const r of sourcesRes.data || []) {
      if (!byClientSrc.has(r.client_id)) byClientSrc.set(r.client_id, new Set());
      byClientSrc.get(r.client_id)!.add(r.source_type);
    }
    const brandSlugs = new Set((brandRes.data || []).map((r: any) => r.client_slug));
    const briefBySlug = new Map<string, number>();
    for (const b of briefsRes.data || []) {
      briefBySlug.set(b.client_slug, (briefBySlug.get(b.client_slug) || 0) + 1);
    }

    const result = list.map((c) => {
      const srcs = byClientSrc.get(c.id) || new Set();
      return {
        slug: c.slug,
        name: c.name,
        display_name: c.display_name,
        accountManagers: slugToAms.get(c.slug) || [],
        modules: {
          leadgen: srcs.has("leads"),
          ecommerce: srcs.has("eshop_costs"),
          marketing: srcs.has("marketing_costs"),
          creative_brand: brandSlugs.has(c.slug),
          creative_briefs: briefBySlug.get(c.slug) || 0,
        },
      };
    });

    return new Response(JSON.stringify({ clients: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("fetch-clients-hub error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});