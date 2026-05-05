import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

type DataSourceRow = {
  client_id: string;
  source_type: string;
  source_urls: string[] | null;
  config: Record<string, unknown> | null;
};

function parseCsvRows(csvText: string): string[][] {
  const lines = csvText.trim().split("\n");
  return lines.slice(1).map((line) => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') inQuotes = !inQuotes;
      else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  });
}

function parseHeaderMap(csvText: string): Record<string, number> {
  const firstLine = csvText.trim().split("\n")[0] || "";
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of firstLine) {
    if (char === '"') inQuotes = !inQuotes;
    else if (char === "," && !inQuotes) {
      values.push(current.trim().toLowerCase().replace(/\s+/g, "_"));
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim().toLowerCase().replace(/\s+/g, "_"));

  const map: Record<string, number> = {};
  values.forEach((h, i) => {
    if (h) map[h] = i;
  });
  return map;
}

function parseDate(dateStr: string): { date: Date; hasTime: boolean } | null {
  if (!dateStr) return null;
  const s = dateStr.trim();

  // YYYY-MM-DD or YYYY-MM-DD HH:mm:ss(.sss)(Z|+01:00)
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})?)?$/);
  if (m) {
    const d = new Date(
      +m[1],
      +m[2] - 1,
      +m[3],
      m[4] ? +m[4] : 0,
      m[5] ? +m[5] : 0,
      m[6] ? +m[6] : 0
    );
    return { date: d, hasTime: !!m[4] };
  }

  // DD.MM.YYYY or DD.MM.YYYY HH:mm
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const d = new Date(
      +m[3],
      +m[2] - 1,
      +m[1],
      m[4] ? +m[4] : 0,
      m[5] ? +m[5] : 0,
      m[6] ? +m[6] : 0
    );
    return { date: d, hasTime: !!m[4] };
  }

  // M/D/YYYY or M/D/YYYY HH:mm (Google Sheets)
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const d = new Date(
      +m[3],
      +m[1] - 1,
      +m[2],
      m[4] ? +m[4] : 0,
      m[5] ? +m[5] : 0,
      m[6] ? +m[6] : 0
    );
    return { date: d, hasTime: !!m[4] };
  }

  return null;
}

function isInLast24Hours(parsed: { date: Date; hasTime: boolean }, now: Date): boolean {
  const threshold = now.getTime() - 24 * 60 * 60 * 1000;
  if (parsed.hasTime) {
    return parsed.date.getTime() >= threshold;
  }

  // Date-only rows: treat as end of that day in local time
  const endOfDay = new Date(
    parsed.date.getFullYear(),
    parsed.date.getMonth(),
    parsed.date.getDate(),
    23,
    59,
    59,
    999
  );
  return endOfDay.getTime() >= threshold;
}

async function fetchCsvSafe(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: clients } = await supabaseAdmin
      .from("clients")
      .select("id, slug, name, display_name");

    if (!clients || clients.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: sources } = await supabaseAdmin
      .from("client_data_sources")
      .select("client_id, source_type, source_urls, config");

    // Fetch AM assignments
    const { data: amRows } = await supabaseAdmin
      .from("account_managers")
      .select("id, display_name");

    const { data: amcRows } = await supabaseAdmin
      .from("account_manager_clients")
      .select("account_manager_id, client_slug")
      .eq("section", "leadgen");

    // Build slug -> AM names map
    const amNameMap = new Map<string, string>();
    for (const am of (amRows || [])) {
      amNameMap.set(am.id, am.display_name || "Neznámý");
    }

    const slugToAms = new Map<string, string[]>();
    for (const amc of (amcRows || [])) {
      const name = amNameMap.get(amc.account_manager_id);
      if (!name) continue;
      const arr = slugToAms.get(amc.client_slug) || [];
      arr.push(name);
      slugToAms.set(amc.client_slug, arr);
    }

    // Fetch last activity per client (client-initiated only)
    const { data: activityRows } = await supabaseAdmin
      .from("client_activity_log")
      .select("client_slug, created_at, description")
      .eq("actor", "client")
      .order("created_at", { ascending: false });

    const lastActivityMap = new Map<string, { created_at: string; description: string | null }>();
    for (const row of (activityRows || [])) {
      if (!lastActivityMap.has(row.client_slug)) {
        lastActivityMap.set(row.client_slug, { created_at: row.created_at, description: row.description });
      }
    }

    // Fetch last activity per AM and admin
    const { data: amActivityRows } = await supabaseAdmin
      .from("client_activity_log")
      .select("actor, created_at, description")
      .or("actor.like.am:%,actor.like.admin:%")
      .order("created_at", { ascending: false });

    const amLastActivity = new Map<string, { at: string; description: string | null }>();
    for (const row of (amActivityRows || [])) {
      // Extract name from "am:Name" or "admin:Name"
      const amName = row.actor.replace(/^(am|admin):/, "");
      if (!amLastActivity.has(amName)) {
        amLastActivity.set(amName, { at: row.created_at, description: row.description });
      }
    }

    const sourceMap = new Map<string, DataSourceRow[]>();
    for (const source of (sources || []) as DataSourceRow[]) {
      const arr = sourceMap.get(source.client_id) || [];
      arr.push(source);
      sourceMap.set(source.client_id, arr);
    }

    const now = new Date();

    // Filter: only include clients that have leadgen-related sources (leads or marketing_costs/ad_costs)
    const leadgenClients = clients.filter((client) => {
      const clientSources = sourceMap.get(client.id) || [];
      return clientSources.some(
        (s) => s.source_type === "leads" || s.source_type === "marketing_costs" || s.source_type === "ad_costs"
      );
    });

    const results = await Promise.all(
      leadgenClients.map(async (client) => {
        const clientSources = sourceMap.get(client.id) || [];
        let adsActive = false;
        let lastLeadDaysAgo: number | null = null;

        // Prefer marketing_costs, fallback ad_costs
        const adsSources = clientSources.filter(
          (s) => s.source_type === "marketing_costs" || s.source_type === "ad_costs"
        );

        for (const source of adsSources) {
          const webFilter = (source.config?.web_filter as string) || null;
          for (const url of source.source_urls || []) {
            const csv = await fetchCsvSafe(url);
            if (!csv) continue;

            const headerMap = parseHeaderMap(csv);
            const dateIndex = headerMap.date ?? 1;
            const costIndex = headerMap.cost ?? 4;
            const webIndex = headerMap.web ?? 0;
            const rows = parseCsvRows(csv);

            for (const row of rows) {
              const web = row[webIndex] || "";
              if (webFilter && web !== webFilter) continue;

              const cost = parseFloat((row[costIndex] || "0").replace(",", ".")) || 0;
              if (cost <= 0) continue;

              const parsed = parseDate(row[dateIndex] || "");
              if (!parsed) continue;

              if (isInLast24Hours(parsed, now)) {
                adsActive = true;
                break;
              }
            }

            if (adsActive) break;
          }

          if (adsActive) break;
        }

        const leadUrls = clientSources
          .filter((s) => s.source_type === "leads")
          .flatMap((s) => s.source_urls || []);

        if (leadUrls.length > 0) {
          const csvResults = await Promise.all(leadUrls.map(fetchCsvSafe));
          let latestDate: Date | null = null;
          for (const csv of csvResults) {
            if (!csv) continue;
            const headerMap = parseHeaderMap(csv);
            const dateIndex = headerMap.date ?? 1;
            const rows = parseCsvRows(csv);
            for (const row of rows) {
              const parsed = parseDate(row[dateIndex] || "");
              if (parsed?.date && (!latestDate || parsed.date > latestDate)) {
                latestDate = parsed.date;
              }
            }
          }
          if (latestDate) {
            const diffMs = now.getTime() - latestDate.getTime();
            lastLeadDaysAgo = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
          }
        }

        const lastActivity = lastActivityMap.get(client.slug) || null;

        return {
          slug: client.slug,
          name: client.display_name || client.name,
          adsActive,
          lastLeadDaysAgo,
          lastActivity: lastActivity ? { at: lastActivity.created_at, description: lastActivity.description } : null,
          accountManagers: slugToAms.get(client.slug) || [],
        };
      })
    );

    // Build AM activity map for response
    const amActivityObj: Record<string, { at: string; description: string | null }> = {};
    for (const [name, act] of amLastActivity) {
      amActivityObj[name] = act;
    }

    return new Response(JSON.stringify({ clients: results, amActivity: amActivityObj }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("fetch-admin-overview error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
