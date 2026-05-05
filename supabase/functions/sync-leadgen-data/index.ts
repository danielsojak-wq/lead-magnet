import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getClientSources } from "../_shared/client-sources.ts";

/*
  sync-leadgen-data
  Syncs marketing_costs and ad_costs from Google Sheets into cached DB tables.
  Called by cron every hour. Can also sync a single client via { client_slug }.
*/

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const singleSlug = body?.client_slug as string | undefined;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Determine which clients to sync
    let clientSlugs: string[] = [];

    if (singleSlug) {
      clientSlugs = [singleSlug];
    } else {
      const { data: clients } = await supabaseAdmin
        .from("clients")
        .select("id, slug");
      const { data: sources } = await supabaseAdmin
        .from("client_data_sources")
        .select("client_id, source_type")
        .in("source_type", ["marketing_costs", "ad_costs"]);

      if (clients && sources) {
        const relevantClientIds = new Set(sources.map(s => s.client_id));
        clientSlugs = clients.filter(c => relevantClientIds.has(c.id)).map(c => c.slug);
      }
    }

    console.log(`Syncing leadgen data for ${clientSlugs.length} clients`);

    const results = await Promise.allSettled(
      clientSlugs.map(slug => syncClient(supabaseAdmin, slug))
    );

    const summary = clientSlugs.map((slug, i) => {
      const r = results[i];
      if (r.status === "fulfilled") return { slug, ...r.value };
      return { slug, status: "error", error: r.reason?.message || "Unknown error" };
    });

    return new Response(JSON.stringify({ results: summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("sync-leadgen-data error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') inQuotes = !inQuotes;
    else if (char === "," && !inQuotes) { values.push(current.trim()); current = ""; }
    else current += char;
  }
  values.push(current.trim());
  return values;
}

function parseHeaderMap(headerLine: string): Record<string, number> {
  const headers = parseCsvLine(headerLine).map(h => h.toLowerCase().replace(/\s+/g, "_"));
  const map: Record<string, number> = {};
  headers.forEach((h, i) => { if (h) map[h] = i; });
  return map;
}

async function fetchCsvSafe(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function syncClient(
  supabaseAdmin: ReturnType<typeof createClient>,
  clientSlug: string
): Promise<{ status: string; marketingRows: number; adRows: number; error?: string }> {
  const startedAt = new Date().toISOString();
  let marketingRows = 0;
  let adRows = 0;

  try {
    // Sync marketing_costs
    try {
      const sources = await getClientSources(clientSlug, "marketing_costs");
      if (sources.urls.length > 0) {
        const config = sources.config;
        const webFilter = (config?.web_filter as string) || null;

        // Fetch lead campaign filter
        let leadCampaignFilter: Set<string> | null = null;
        try {
          const { data: leadCampaigns } = await supabaseAdmin
            .from("client_lead_campaigns")
            .select("campaign_name")
            .eq("client_slug", clientSlug);
          if (leadCampaigns && leadCampaigns.length > 0) {
            leadCampaignFilter = new Set(leadCampaigns.map((r: any) => r.campaign_name));
          }
        } catch {}

        const csv = await fetchCsvSafe(sources.urls[0]);
        if (csv) {
          const lines = csv.trim().split("\n");
          const headerMap = parseHeaderMap(lines[0] || "");

          const rows = lines.slice(1).map(line => {
            const v = parseCsvLine(line);
            return {
              client_slug: clientSlug,
              web: v[headerMap.web ?? 0] || "",
              date: v[headerMap.date ?? 1] || "",
              source: v[headerMap.source ?? 2] || "",
              medium: v[headerMap.medium ?? 3] || "",
              cost: parseFloat(v[headerMap.cost ?? 4] || "0") || 0,
              clicks: parseInt(v[headerMap.clicks ?? 5] || "0") || 0,
              impressions: parseInt(v[headerMap.impressions ?? 6] || "0") || 0,
              campaign_name: v[headerMap.campaign_name ?? headerMap.campaignname ?? 7] || "",
              campaign_id: v[headerMap.campaign_id ?? headerMap.campaignid ?? 8] || "",
              conversions: parseFloat(v[headerMap.conversions ?? 9] || "0") || 0,
              conversions_value: parseFloat(v[headerMap.conversions_value ?? headerMap.conversionsvalue ?? 10] || "0") || 0,
              synced_at: startedAt,
            };
          }).filter(r => {
            if (!r.date) return false;
            if (webFilter && r.web !== webFilter) return false;
            if (leadCampaignFilter && !leadCampaignFilter.has(r.campaign_name)) return false;
            return true;
          });

          // Delete old + insert new
          await supabaseAdmin.from("cached_marketing_costs").delete().eq("client_slug", clientSlug);
          if (rows.length > 0) {
            const batchSize = 500;
            for (let i = 0; i < rows.length; i += batchSize) {
              const { error } = await supabaseAdmin.from("cached_marketing_costs").insert(rows.slice(i, i + batchSize));
              if (error) throw error;
            }
          }
          marketingRows = rows.length;
        }
      }
    } catch (e) {
      console.error(`Marketing costs sync error for ${clientSlug}:`, e);
    }

    // Sync ad_costs
    try {
      const sources = await getClientSources(clientSlug, "ad_costs");
      if (sources.urls.length > 0) {
        const csv = await fetchCsvSafe(sources.urls[0]);
        if (csv) {
          const lines = csv.trim().split("\n");
          const headerMap = parseHeaderMap(lines[0] || "");

          const rows = lines.slice(1).map(line => {
            const v = parseCsvLine(line);
            return {
              client_slug: clientSlug,
              web: v[0] || "",
              date: v[1] || "",
              source: v[2] || "",
              medium: v[3] || "",
              cost: parseFloat(v[4] || "0") || 0,
              clicks: parseInt(v[5] || "0") || 0,
              impressions: parseInt(v[6] || "0") || 0,
              campaign_name: v[7] || "",
              campaign_id: v[8] || "",
              conversions: parseFloat(v[9] || "0") || 0,
              conversions_value: parseFloat(v[10] || "0") || 0,
              synced_at: startedAt,
            };
          }).filter(r => r.date);

          await supabaseAdmin.from("cached_ad_costs").delete().eq("client_slug", clientSlug);
          if (rows.length > 0) {
            const batchSize = 500;
            for (let i = 0; i < rows.length; i += batchSize) {
              const { error } = await supabaseAdmin.from("cached_ad_costs").insert(rows.slice(i, i + batchSize));
              if (error) throw error;
            }
          }
          adRows = rows.length;
        }
      }
    } catch (e) {
      console.error(`Ad costs sync error for ${clientSlug}:`, e);
    }

    // Log sync
    await supabaseAdmin.from("data_sync_log").insert({
      client_slug: clientSlug,
      source_type: "leadgen_costs",
      status: "ok",
      rows_count: marketingRows + adRows,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    });

    return { status: "ok", marketingRows, adRows };
  } catch (err) {
    const errMsg = err?.message || "Unknown error";
    await supabaseAdmin.from("data_sync_log").insert({
      client_slug: clientSlug,
      source_type: "leadgen_costs",
      status: "error",
      rows_count: 0,
      error_message: errMsg,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    }).catch(() => {});
    return { status: "error", marketingRows: 0, adRows: 0, error: errMsg };
  }
}
