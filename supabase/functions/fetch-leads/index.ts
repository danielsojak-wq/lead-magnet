import { corsHeaders } from "../_shared/cors.ts";
import { getClientSources, parseClientSlug } from "../_shared/client-sources.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type LeadRow = { date: string; qualified: boolean; source?: string };

const lastSuccessfulLeads = new Map<string, LeadRow[]>();

function parseCsv(
  csvText: string,
  dateColumn: number,
  qualifiedColumn: number,
  submissionIdColumn: number,
  qualifiedValues: string[],
  defaultQualified: string
): { date: string; qualified: boolean; submissionId: string; rawQualified: string }[] {
  const lines = csvText.trim().split("\n");
  return lines
    .slice(1)
    .map((line) => {
      const values: string[] = [];
      let current = "";
      let inQuotes = false;
      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
          values.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      values.push(current.trim());

      const date = values[dateColumn] || "";
      const submissionId = values[submissionIdColumn] || "";
      let qualVal = (values[qualifiedColumn] || "").trim().toLowerCase();
      if (!qualVal && defaultQualified) qualVal = defaultQualified;
      const qualified = qualifiedValues.includes(qualVal);

      return { date, qualified, submissionId, rawQualified: qualVal };
    })
    .filter((r) => r.date);
}

async function fetchCsvWithRetry(url: string, attempts = 3): Promise<string> {
  let lastError = "Unknown error";

  for (let i = 1; i <= attempts; i++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "text/csv,text/plain,*/*", "Cache-Control": "no-cache" },
        cache: "no-store",
      });

      if (response.ok) {
        return await response.text();
      }

      lastError = `HTTP ${response.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timeout);
    }

    if (i < attempts) {
      await new Promise((r) => setTimeout(r, i * 800));
    }
  }

  throw new Error(`Failed to fetch leads CSV after ${attempts} attempts: ${lastError}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let clientSlug = "unknown";

  try {
    const body = await req.json();
    clientSlug = parseClientSlug(body);
    const { urls, config, sourceConfigs, sourceLabels } = await getClientSources(clientSlug, "leads");

    // Read column mappings from config (same format as fetch-leads-detail)
    const columns = (config?.columns || {}) as Record<string, number>;
    const dateColumn = typeof columns.date === "number" ? columns.date : 1;
    const qualifiedColumn = typeof columns.qualified === "number" ? columns.qualified : 4;
    const submissionIdColumn = typeof columns.submissionId === "number" ? columns.submissionId : 0;

    // Read qualification values from config
    const qualification = (config?.qualification || {}) as { qualified_values?: string[]; not_qualified_values?: string[] };
    const qualifiedValues = Array.isArray(qualification.qualified_values) && qualification.qualified_values.length > 0
      ? qualification.qualified_values.map((v: string) => v.toLowerCase())
      : ["ano"];

    // default_qualified is now per-source, handled below

    if (urls.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch lead_reviews from DB to override sheet qualification
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: reviewRows } = await supabaseAdmin
      .from("lead_reviews")
      .select("submission_id, status")
      .eq("client_slug", clientSlug);
    const reviewMap = new Map<string, string>();
    for (const r of reviewRows || []) {
      reviewMap.set(r.submission_id, r.status);
    }

    

    const results = await Promise.all(
      urls.map(async (url, idx) => {
        const csvText = await fetchCsvWithRetry(url);
        const srcCfg = sourceConfigs[idx] || {};
        const srcDefault = typeof srcCfg.default_qualified === "string" ? (srcCfg.default_qualified as string).toLowerCase() : "";
        const label = sourceLabels[idx] || (srcCfg.source_name as string) || "";
        return parseCsv(csvText, dateColumn, qualifiedColumn, submissionIdColumn, qualifiedValues, srcDefault).map(r => ({ ...r, _source: label }));
      })
    );

    // Merge DB reviews: override qualified status
    const rows: LeadRow[] = results.flat().map((r) => {
      const dbStatus = reviewMap.get(r.submissionId);
      const source = r._source || undefined;
      if (dbStatus) {
        return { date: r.date, qualified: dbStatus === "relevant", source };
      }
      return { date: r.date, qualified: r.qualified, source };
    });

    lastSuccessfulLeads.set(clientSlug, rows);

    return new Response(JSON.stringify(rows), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("fetch-leads error:", message);

    return new Response(JSON.stringify(lastSuccessfulLeads.get(clientSlug) || []), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-Data-Warning": `upstream-failed:${message}`,
      },
    });
  }
});
