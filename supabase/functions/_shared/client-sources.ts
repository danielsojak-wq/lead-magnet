import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Convert any Google Sheets URL to CSV export format.
 * Handles /edit, /pub, /gviz, and already-correct /export URLs.
 */
export function normalizeSheetUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  // Already a working CSV URL (export or gviz)
  if (trimmed.includes("/export?") || trimmed.includes("/export&") || trimmed.includes("/gviz/")) return trimmed;

  // Match spreadsheet ID and optional gid
  const match = trimmed.match(
    /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:\/[^?&#]*)?(?:[?&#]gid=(\d+))?(?:.*#gid=(\d+))?/
  );
  if (!match) return trimmed; // not a Google Sheets URL, return as-is

  const spreadsheetId = match[1];
  const gid = match[2] || match[3] || "0";
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
}

/**
 * Look up data source URLs for a given client slug and source type.
 * URLs are auto-normalized to CSV export format.
 */
export async function getClientSources(
  clientSlug: string,
  sourceType: string
): Promise<{ urls: string[]; config: Record<string, unknown>; sourceLabels: string[]; sourceConfigs: Record<string, unknown>[] }> {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("slug", clientSlug)
    .single();

  if (!client) {
    throw new Error("Client not found");
  }

  const { data: sources } = await supabaseAdmin
    .from("client_data_sources")
    .select("source_urls, config")
    .eq("client_id", client.id)
    .eq("source_type", sourceType);

  if (!sources || sources.length === 0) {
    throw new Error(`No ${sourceType} data source configured for this client`);
  }

  // Merge all matching sources (there may be multiple rows for leads)
  const allUrls: string[] = [];
  const sourceLabels: string[] = [];
  const sourceConfigs: Record<string, unknown>[] = [];
  let mergedConfig: Record<string, unknown> = {};
  for (const source of sources) {
    const urls = (source.source_urls || []).map(normalizeSheetUrl);
    const cfg = (source.config || {}) as Record<string, unknown>;
    const label = (cfg.source_name as string) || "";
    for (const u of urls) {
      allUrls.push(u);
      sourceLabels.push(label);
      sourceConfigs.push(cfg);
    }
    mergedConfig = { ...mergedConfig, ...cfg };
  }

  return { urls: allUrls, config: mergedConfig, sourceLabels, sourceConfigs };
}

/**
 * Validate client_slug from request body.
 */
export function parseClientSlug(body: Record<string, unknown>): string {
  const slug = body?.client_slug;
  if (!slug || typeof slug !== "string") {
    throw new Error("Missing client_slug");
  }
  return slug;
}
