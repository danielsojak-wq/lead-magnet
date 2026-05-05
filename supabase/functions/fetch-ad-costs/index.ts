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
      .from("cached_ad_costs")
      .select("*")
      .eq("client_slug", clientSlug);

    if (!cacheErr && cached && cached.length > 0) {
      console.log(`Serving ${cached.length} cached ad cost rows for ${clientSlug}`);
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

    const { urls } = await getClientSources(clientSlug, "ad_costs");

    if (urls.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const response = await fetch(urls[0]);
    if (!response.ok) {
      throw new Error(`Failed to fetch sheet: ${response.status}`);
    }

    const csvText = await response.text();
    const lines = csvText.trim().split('\n');

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
        web: values[0] || '',
        date: values[1] || '',
        source: values[2] || '',
        medium: values[3] || '',
        cost: parseFloat(values[4] || '0') || 0,
        clicks: parseInt(values[5] || '0') || 0,
        impressions: parseInt(values[6] || '0') || 0,
        campaignName: values[7] || '',
        campaignId: values[8] || '',
        conversions: parseFloat(values[9] || '0') || 0,
        conversionsValue: parseFloat(values[10] || '0') || 0,
      };
    }).filter(r => r.date);

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
