import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { getClientSources, parseClientSlug, normalizeSheetUrl } from "../_shared/client-sources.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const clientSlug = parseClientSlug(body);
    const action = body.action || "get";

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (action === "save") {
      // body.mappings = { sourceName: [value, ...], ... }
      // body.match_type = "campaign" | "adset" | "ad"
      const mappings = body.mappings as Record<string, string[]>;
      const matchType = body.match_type || "campaign";
      if (!mappings) throw new Error("Missing mappings");

      // Delete all existing mappings for this client
      await supabaseAdmin
        .from("source_campaign_mappings")
        .delete()
        .eq("client_slug", clientSlug);

      // Insert new mappings
      const rows: { client_slug: string; source_name: string; campaign_name: string; match_type: string }[] = [];
      for (const [sourceName, values] of Object.entries(mappings)) {
        for (const value of values) {
          rows.push({ client_slug: clientSlug, source_name: sourceName, campaign_name: value, match_type: matchType });
        }
      }
      if (rows.length > 0) {
        const { error } = await supabaseAdmin.from("source_campaign_mappings").insert(rows);
        if (error) throw error;
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // action === "get": return sources, all campaigns/adsets/ads, and current mappings

    // 1. Get lead source names
    let leadSourceNames: string[] = [];
    try {
      const { sourceConfigs } = await getClientSources(clientSlug, "leads");
      leadSourceNames = sourceConfigs.map(
        (cfg, idx) => (cfg.source_name as string) || `Zdroj ${idx + 1}`
      );
    } catch {
      // no lead sources
    }

    // 2. Get ALL campaigns, adsets, ads from marketing_costs CSV
    let allCampaigns: string[] = [];
    let allAdsets: string[] = [];
    let allAds: string[] = [];
    try {
      const { urls, config } = await getClientSources(clientSlug, "marketing_costs");
      if (urls.length > 0) {
        const webFilter = (config?.web_filter as string) || null;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        try {
          const res = await fetch(urls[0], { signal: controller.signal });
          if (res.ok) {
            const csvText = await res.text();
            const lines = csvText.trim().split("\n");
            // Parse header
            const headerLine = lines[0] || "";
            const headers: string[] = [];
            let hCur = "", hQ = false;
            for (const ch of headerLine) {
              if (ch === '"') hQ = !hQ;
              else if (ch === ',' && !hQ) { headers.push(hCur.trim().toLowerCase().replace(/\s+/g, '_')); hCur = ''; }
              else hCur += ch;
            }
            headers.push(hCur.trim().toLowerCase().replace(/\s+/g, '_'));
            const hMap: Record<string, number> = {};
            headers.forEach((h, i) => { if (h) hMap[h] = i; });

            const campIdx = hMap.campaign_name ?? hMap.campaignname ?? 7;
            const webIdx = hMap.web ?? 0;
            const adsetIdx = hMap.adset_name ?? hMap.adsetname ?? hMap.ad_group_name ?? hMap.ad_group;
            const adIdx = hMap.ad_name ?? hMap.adname;

            const campaignSet = new Set<string>();
            const adsetSet = new Set<string>();
            const adSet = new Set<string>();

            for (let i = 1; i < lines.length; i++) {
              const vals: string[] = [];
              let cur = "", q = false;
              for (const ch of lines[i]) {
                if (ch === '"') q = !q;
                else if (ch === ',' && !q) { vals.push(cur.trim()); cur = ''; }
                else cur += ch;
              }
              vals.push(cur.trim());
              if (webFilter && (vals[webIdx] || '') !== webFilter) continue;
              const cn = vals[campIdx] || '';
              if (cn) campaignSet.add(cn);
              if (adsetIdx !== undefined) {
                const an = vals[adsetIdx] || '';
                if (an) adsetSet.add(an);
              }
              if (adIdx !== undefined) {
                const an = vals[adIdx] || '';
                if (an) adSet.add(an);
              }
            }
            allCampaigns = [...campaignSet].sort();
            allAdsets = [...adsetSet].sort();
            allAds = [...adSet].sort();
          }
        } finally {
          clearTimeout(timeout);
        }
      }
    } catch {
      // no marketing costs
    }

    // 3. Get current mappings
    const { data: mappingRows } = await supabaseAdmin
      .from("source_campaign_mappings")
      .select("source_name, campaign_name, match_type")
      .eq("client_slug", clientSlug);

    const mappings: Record<string, string[]> = {};
    let matchType = "campaign";
    for (const row of mappingRows || []) {
      if (!mappings[row.source_name]) mappings[row.source_name] = [];
      mappings[row.source_name].push(row.campaign_name);
      if (row.match_type) matchType = row.match_type;
    }

    return new Response(
      JSON.stringify({ sources: leadSourceNames, campaigns: allCampaigns, adsets: allAdsets, ads: allAds, mappings, matchType }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("manage-source-comparison error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
