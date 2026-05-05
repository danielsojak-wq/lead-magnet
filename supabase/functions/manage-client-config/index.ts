import { corsHeaders } from "../_shared/cors.ts";
import { normalizeSheetUrl } from "../_shared/client-sources.ts";
import { triggerClientSync } from "../_shared/trigger-sync.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function checkUrlAccessible(url: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "text/csv,text/plain,*/*" },
      cache: "no-store",
    });
    clearTimeout(timeout);
    if (res.ok) {
      const text = await res.text();
      if (text.length < 5) return { ok: false, error: "Prázdná odpověď – zkontrolujte oprávnění sdílení" };
      return { ok: true };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, error: 'Pristup odepren - nastavte sdileni na "Kdokoli s odkazem"' };
    }
    return { ok: false, status: res.status, error: `HTTP ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort")) return { ok: false, error: "Timeout – URL neodpovídá do 10s" };
    return { ok: false, error: msg };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { action, client_slug } = body as { action?: string; client_slug?: string };

    if (!client_slug) {
      return new Response(
        JSON.stringify({ error: "client_slug is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id, name, display_name, slug")
      .eq("slug", client_slug)
      .maybeSingle();

    if (!client) {
      return new Response(
        JSON.stringify({ error: "Client not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── GET config ──
    if (action === "get") {
      const { data: sources } = await supabaseAdmin
        .from("client_data_sources")
        .select("id, source_type, source_urls, config")
        .eq("client_id", client.id);

      return new Response(
        JSON.stringify({
          client: { id: client.id, name: client.name, display_name: client.display_name, slug: client.slug },
          sources: sources || [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── VALIDATE URLs ──
    if (action === "validate") {
      const urls: string[] = body.urls || [];
      const results = await Promise.all(
        urls.map(async (rawUrl: string) => {
          const normalized = normalizeSheetUrl(rawUrl);
          const check = await checkUrlAccessible(normalized);
          return { original: rawUrl, normalized, ...check };
        })
      );
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── UPDATE config ──
    if (action === "update") {
      const { sources } = body;

      if (!Array.isArray(sources)) {
        return new Response(
          JSON.stringify({ error: "sources array is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: deleteError } = await supabaseAdmin
        .from("client_data_sources")
        .delete()
        .eq("client_id", client.id);

      if (deleteError) {
        throw new Error(`Failed to clear existing sources: ${deleteError.message}`);
      }

      const rowsToInsert: { client_id: string; source_type: string; source_urls: string[]; config: Record<string, unknown> }[] = [];

      for (const source of sources) {
        const sourceType = typeof source?.source_type === "string" ? source.source_type : "";
        if (!sourceType) continue;

        // Auto-normalize all URLs on save
        const filteredUrls = (source.source_urls || [])
          .map((u: string) => normalizeSheetUrl(u))
          .filter((u: string) => u.trim());

        // Skip empty sources (including leads) to avoid creating invisible rows
        if (filteredUrls.length === 0) continue;

        rowsToInsert.push({
          client_id: client.id,
          source_type: sourceType,
          source_urls: filteredUrls,
          config: (source.config || {}) as Record<string, unknown>,
        });
      }

      if (rowsToInsert.length > 0) {
        const { error: insertError } = await supabaseAdmin
          .from("client_data_sources")
          .insert(rowsToInsert);

        if (insertError) {
          throw new Error(`Failed to save sources: ${insertError.message}`);
        }
      }

      if (body.display_name !== undefined) {
        const { error: nameError } = await supabaseAdmin
          .from("clients")
          .update({ display_name: body.display_name || null })
          .eq("id", client.id);

        if (nameError) {
          throw new Error(`Failed to update display_name: ${nameError.message}`);
        }
      }

      // Trigger immediate cache resync for any source types that affect cached
      // dashboards (marketing_costs / ad_costs → leadgen, eshop_costs → eshop).
      const touchedTypes = new Set(rowsToInsert.map((r) => r.source_type));
      if (touchedTypes.has("marketing_costs") || touchedTypes.has("ad_costs")) {
        // @ts-ignore Deno runtime
        EdgeRuntime.waitUntil(triggerClientSync("sync-leadgen-data", client.slug));
      }
      if (touchedTypes.has("eshop_costs")) {
        // @ts-ignore Deno runtime
        EdgeRuntime.waitUntil(triggerClientSync("sync-eshop-data", client.slug));
      }

      return new Response(
        JSON.stringify({ success: true, saved_sources: rowsToInsert.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── DELETE client ──
    if (action === "delete") {
      const slug = client.slug;
      const cleanup: { table: string; error: string | null }[] = [];

      // Tables referencing the client by client_slug (text, no FK).
      const slugTables = [
        "cached_marketing_costs",
        "cached_ad_costs",
        "cached_eshop_costs",
        "client_lead_campaigns",
        "client_activity_log",
        "lead_reviews",
        "lead_timeline",
        "eshop_budget_targets",
        "notification_rules",
        "source_campaign_mappings",
        "account_manager_clients",
        "data_sync_log",
        "creative_brand_profiles",
        "creative_briefs",
        "competitors",
        "competitor_ads",
        "competitor_insights",
        "competitor_scrape_runs",
        "competitor_website_cache",
      ];

      // Delete child records that depend on creative_briefs (which has no FK cascade).
      const { data: briefs } = await supabaseAdmin
        .from("creative_briefs")
        .select("id")
        .eq("client_slug", slug);
      const briefIds = (briefs || []).map((b) => b.id);
      if (briefIds.length > 0) {
        const { data: variants } = await supabaseAdmin
          .from("creative_brief_variants")
          .select("id")
          .in("brief_id", briefIds);
        const variantIds = (variants || []).map((v) => v.id);
        if (variantIds.length > 0) {
          await supabaseAdmin.from("creative_assets").delete().in("variant_id", variantIds);
        }
        await supabaseAdmin.from("creative_brief_variants").delete().in("brief_id", briefIds);
        await supabaseAdmin.from("creative_brief_inspirations").delete().in("brief_id", briefIds);
      }

      for (const table of slugTables) {
        const { error } = await supabaseAdmin.from(table).delete().eq("client_slug", slug);
        cleanup.push({ table, error: error?.message ?? null });
      }

      // Remove logo files from the client-logos storage bucket (png + webp).
      try {
        await supabaseAdmin.storage
          .from("client-logos")
          .remove([`${slug}.png`, `${slug}.webp`]);
      } catch (e) {
        console.warn("logo cleanup failed:", (e as Error).message);
      }

      // Finally, delete the client itself (cascades client_data_sources via FK).
      const { error: deleteError } = await supabaseAdmin
        .from("clients")
        .delete()
        .eq("id", client.id);

      if (deleteError) throw new Error(`Failed to delete client: ${deleteError.message}`);

      return new Response(
        JSON.stringify({ success: true, cleanup }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        error: `Unknown action: ${action ?? "(missing)"}`,
        received_keys: Object.keys(body),
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("manage-client-config error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
