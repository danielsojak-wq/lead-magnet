import { corsHeaders } from "../_shared/cors.ts";
import { getClientSources, parseClientSlug } from "../_shared/client-sources.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const clientSlug = parseClientSlug(body);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Try cache first
    const { data: cached, error: cacheErr } = await supabaseAdmin
      .from("cached_marketing_costs")
      .select("*")
      .eq("client_slug", clientSlug);

    if (!cacheErr && cached && cached.length > 0) {
      console.log(`Serving ${cached.length} cached marketing cost rows for ${clientSlug}`);
      const rows = cached.map(r => ({
        web: r.web,
        date: r.date,
        source: r.source,
        medium: r.medium,
        cost: r.cost,
        clicks: r.clicks,
        impressions: r.impressions,
        campaignName: r.campaign_name,
        campaignId: r.campaign_id,
        conversions: r.conversions,
        conversionsValue: r.conversions_value,
      }));
      return new Response(JSON.stringify(rows), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fallback: fetch from Google Sheets
    console.log(`Cache empty for ${clientSlug}, falling back to Google Sheets`);

    let urls: string[] = [];
    let config: Record<string, unknown> = {};
    try {
      const sources = await getClientSources(clientSlug, "marketing_costs");
      urls = sources.urls;
      config = sources.config;
    } catch {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const webFilter = (config?.web_filter as string) || null;

    if (urls.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch lead campaign filter from DB
    let leadCampaignFilter: Set<string> | null = null;
    try {
      const { data: leadCampaigns } = await supabaseAdmin
        .from("client_lead_campaigns")
        .select("campaign_name")
        .eq("client_slug", clientSlug);
      if (leadCampaigns && leadCampaigns.length > 0) {
        leadCampaignFilter = new Set(leadCampaigns.map((r: any) => r.campaign_name));
      }
    } catch (e) {
      console.error("Failed to fetch lead campaigns:", e);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    
    let response: Response;
    try {
      response = await fetch(urls[0], { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    
    if (!response.ok) {
      throw new Error(`Failed to fetch sheet: ${response.status}`);
    }

    const csvText = await response.text();
    const lines = csvText.trim().split('\n');

    const headerLine = lines[0] || '';
    const headers: string[] = [];
    let hCurrent = '';
    let hInQuotes = false;
    for (const char of headerLine) {
      if (char === '"') { hInQuotes = !hInQuotes; }
      else if (char === ',' && !hInQuotes) { headers.push(hCurrent.trim().toLowerCase().replace(/\s+/g, '_')); hCurrent = ''; }
      else { hCurrent += char; }
    }
    headers.push(hCurrent.trim().toLowerCase().replace(/\s+/g, '_'));
    const headerMap: Record<string, number> = {};
    headers.forEach((h, i) => { if (h) headerMap[h] = i; });
    
    const rows = lines.slice(1).map(line => {
      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      for (const char of line) {
        if (char === '"') { inQuotes = !inQuotes; }
        else if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
        else { current += char; }
      }
      values.push(current.trim());

      return {
        web: values[headerMap.web ?? 0] || '',
        date: values[headerMap.date ?? 1] || '',
        source: values[headerMap.source ?? 2] || '',
        medium: values[headerMap.medium ?? 3] || '',
        cost: parseFloat(values[headerMap.cost ?? 4] || '0') || 0,
        clicks: parseInt(values[headerMap.clicks ?? 5] || '0') || 0,
        impressions: parseInt(values[headerMap.impressions ?? 6] || '0') || 0,
        campaignName: values[headerMap.campaign_name ?? headerMap.campaignname ?? 7] || '',
        campaignId: values[headerMap.campaign_id ?? headerMap.campaignid ?? 8] || '',
        conversions: parseFloat(values[headerMap.conversions ?? 9] || '0') || 0,
        conversionsValue: parseFloat(values[headerMap.conversions_value ?? headerMap.conversionsvalue ?? 10] || '0') || 0,
        adsetName: values[headerMap.adset_name ?? headerMap.adsetname ?? headerMap.ad_group_name ?? headerMap.ad_group] || '',
        adName: values[headerMap.ad_name ?? headerMap.adname] || '',
      };
    }).filter(r => {
      if (!r.date) return false;
      if (webFilter && r.web !== webFilter) return false;
      if (leadCampaignFilter && !leadCampaignFilter.has(r.campaignName)) return false;
      return true;
    });

    return new Response(JSON.stringify(rows), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
