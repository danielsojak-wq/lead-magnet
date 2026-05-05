import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getClientSources, normalizeSheetUrl } from "../_shared/client-sources.ts";
import { parseEshopCsv } from "../_shared/parse-eshop-csv.ts";

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
      // Get all clients with eshop_costs source
      const { data: clients } = await supabaseAdmin
        .from("clients")
        .select("id, slug");
      const { data: sources } = await supabaseAdmin
        .from("client_data_sources")
        .select("client_id, source_type")
        .eq("source_type", "eshop_costs");

      if (clients && sources) {
        const eshopClientIds = new Set(sources.map(s => s.client_id));
        clientSlugs = clients.filter(c => eshopClientIds.has(c.id)).map(c => c.slug);
      }
    }

    // Sync each client
    const results = await Promise.allSettled(
      clientSlugs.map(slug => syncClient(supabaseAdmin, slug))
    );

    const summary = clientSlugs.map((slug, i) => {
      const r = results[i];
      if (r.status === "fulfilled") return { slug, ...r.value };
      return { slug, status: "error", error: r.reason?.message || "Unknown error", rows: 0 };
    });

    return new Response(JSON.stringify({ results: summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("sync-eshop-data error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function syncClient(
  supabaseAdmin: ReturnType<typeof createClient>,
  clientSlug: string
): Promise<{ status: string; rows: number; error?: string }> {
  const startedAt = new Date().toISOString();

  try {
    // Get source config
    const sources = await getClientSources(clientSlug, "eshop_costs");
    if (!sources.urls.length) {
      await logSync(supabaseAdmin, clientSlug, "ok", 0, null, startedAt);
      return { status: "ok", rows: 0 };
    }

    const config = sources.config;
    const webFilter = (config?.web_filter as string) || null;
    const excludedCampaignsRaw = (config?.excluded_campaigns as string) || "";
    const excludedCampaigns = excludedCampaignsRaw
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);

    // Fetch CSV with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    let response: Response;
    try {
      response = await fetch(sources.urls[0], { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errMsg = `Sheet fetch failed: ${response.status}`;
      await logSync(supabaseAdmin, clientSlug, "error", 0, errMsg, startedAt);
      return { status: "error", rows: 0, error: errMsg };
    }

    const csvText = await response.text();
    const parsedRows = parseEshopCsv(csvText, { webFilter, excludedCampaigns });

    // Delete old cache and insert new
    await supabaseAdmin
      .from("cached_eshop_costs")
      .delete()
      .eq("client_slug", clientSlug);

    if (parsedRows.length > 0) {
      // Insert in batches of 500
      const batchSize = 500;
      for (let i = 0; i < parsedRows.length; i += batchSize) {
        const batch = parsedRows.slice(i, i + batchSize).map(r => ({
          client_slug: clientSlug,
          date: r.date,
          channel: r.channel,
          campaign_name: r.campaignName,
          web: r.web,
          cost: r.cost,
          synced_at: startedAt,
        }));
        const { error } = await supabaseAdmin.from("cached_eshop_costs").insert(batch);
        if (error) {
          console.error(`Insert error for ${clientSlug} batch ${i}:`, error);
          throw error;
        }
      }
    }

    await logSync(supabaseAdmin, clientSlug, "ok", parsedRows.length, null, startedAt);
    return { status: "ok", rows: parsedRows.length };
  } catch (err) {
    const errMsg = err?.message || "Unknown error";
    await logSync(supabaseAdmin, clientSlug, "error", 0, errMsg, startedAt).catch(() => {});
    return { status: "error", rows: 0, error: errMsg };
  }
}

async function logSync(
  supabaseAdmin: ReturnType<typeof createClient>,
  clientSlug: string,
  status: string,
  rowsCount: number,
  errorMessage: string | null,
  startedAt: string
) {
  await supabaseAdmin.from("data_sync_log").insert({
    client_slug: clientSlug,
    source_type: "eshop_costs",
    status,
    rows_count: rowsCount,
    error_message: errorMessage,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  });
}
