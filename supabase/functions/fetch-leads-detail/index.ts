import { corsHeaders } from "../_shared/cors.ts";
import { getClientSources, parseClientSlug } from "../_shared/client-sources.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface LeadDetail {
  submissionId: string;
  date: string;
  firstName: string;
  lastName?: string;
  phone: string;
  qualified: string;
  customFields?: Record<string, string>;
  isDuplicate?: boolean;
  duplicateOfId?: string;
  source?: string;
}

interface ColumnMapping {
  submissionId: number;
  date: number;
  firstName: number;
  lastName?: number;
  phone: number;
  qualified: number;
  email?: number;
  company?: number;
}

const DEFAULT_COLUMNS: ColumnMapping = {
  submissionId: 0,
  date: 1,
  firstName: 2,
  phone: 3,
  qualified: 4,
};

interface CustomColumnDef {
  name: string;
  column: number;
  icon?: string;
}

function parseCsvRow(line: string): string[] {
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
  return values;
}

function parseCsv(
  csvText: string,
  columns: ColumnMapping,
  nameSplit: boolean,
  customColumns: CustomColumnDef[]
): LeadDetail[] {
  const lines = csvText.trim().split("\n");
  return lines
    .slice(1)
    .map((line) => {
      const values = parseCsvRow(line);

      const rawQualified = (values[columns.qualified] || "").trim().toLowerCase();

      const lead: LeadDetail = {
        submissionId: values[columns.submissionId] || "",
        date: values[columns.date] || "",
        firstName: values[columns.firstName] || "",
        phone: values[columns.phone] || "",
        qualified: rawQualified,
      };

      // If name_split is enabled, grab lastName
      if (nameSplit && columns.lastName !== undefined && columns.lastName >= 0) {
        lead.lastName = values[columns.lastName] || "";
      }

      // Parse built-in email/company columns
      const fields: Record<string, string> = {};
      if (columns.email !== undefined && columns.email >= 0) {
        const val = (values[columns.email] || "").trim();
        if (val) fields["Email"] = val;
      }
      if (columns.company !== undefined && columns.company >= 0) {
        const val = (values[columns.company] || "").trim();
        if (val) fields["Firma"] = val;
      }

      // Parse custom columns
      if (customColumns.length > 0) {
        for (const cc of customColumns) {
          const val = (values[cc.column] || "").trim();
          if (val) fields[cc.name] = val;
        }
      }
      if (Object.keys(fields).length > 0) lead.customFields = fields;

      return lead;
    })
    .filter((r) => r.date && r.submissionId);
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
      if (response.ok) return await response.text();
      lastError = `HTTP ${response.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timeout);
    }
    if (i < attempts) await new Promise((r) => setTimeout(r, i * 800));
  }
  throw new Error(`Failed after ${attempts} attempts: ${lastError}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const clientSlug = parseClientSlug(body);
    const limit = typeof body.limit === "number" ? body.limit : 0; // 0 = no limit
    const filter = body.filter || "unreviewed";
    const { urls, config, sourceLabels, sourceConfigs } = await getClientSources(clientSlug, "leads");

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
      // Map DB status to sheet-compatible value
      const mapped = r.status === "relevant" ? "ano" : r.status === "duplicate" ? "duplicita" : "ne";
      reviewMap.set(r.submission_id, mapped);
    }

    // Build column mapping from config or use defaults
    const columns: ColumnMapping = config?.columns
      ? { ...DEFAULT_COLUMNS, ...(config.columns as Partial<ColumnMapping>) }
      : DEFAULT_COLUMNS;

    const nameSplit = config?.name_split === true;
    const customColumns: CustomColumnDef[] = Array.isArray(config?.custom_columns)
      ? (config.custom_columns as CustomColumnDef[])
      : [];

    if (urls.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    

    const results = await Promise.all(
      urls.map(async (url, idx) => {
        const csvText = await fetchCsvWithRetry(url);
        const label = sourceLabels[idx] || `Zdroj ${idx + 1}`;
        const srcCfg = sourceConfigs[idx] || {};
        const srcDefault = typeof srcCfg.default_qualified === "string" ? (srcCfg.default_qualified as string).toLowerCase() : "";
        return parseCsv(csvText, columns, nameSplit, customColumns).map((l) => ({ ...l, source: label, _defaultQualified: srcDefault }));
      })
    );

    const allLeads = results.flat().map((l) => {
      const { _defaultQualified, ...lead } = l;
      // DB review overrides sheet value (handles async writeback delay)
      const dbStatus = reviewMap.get(lead.submissionId);
      return {
        ...lead,
        qualified: dbStatus || lead.qualified || _defaultQualified,
      };
    });

    // Build the set of "reviewed" statuses from config qualification values
    const qualification = (config?.qualification || {}) as { qualified_values?: string[]; not_qualified_values?: string[] };
    const configReviewedStatuses = new Set<string>();
    for (const v of (qualification.qualified_values || [])) configReviewedStatuses.add(v.toLowerCase());
    for (const v of (qualification.not_qualified_values || [])) configReviewedStatuses.add(v.toLowerCase());
    for (const v of ["ano", "ne", "duplicita", "duplicate", "relevant", "irrelevant"]) configReviewedStatuses.add(v);

    // Duplicate detection: check phone & email within a 7-day window only
    const DUPLICATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
    const normalizePhone = (p: string) => p.replace(/\D/g, "");

    // Parse lead dates for comparison
    const parseLeadDate = (dateStr: string): Date | null => {
      if (!dateStr) return null;
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? null : d;
    };

    const sortedAll = [...allLeads].sort((a, b) => a.date.localeCompare(b.date));
    const duplicateMap = new Map<string, string>();

    // Store seen leads with their dates for window checking
    const seenPhones = new Map<string, { id: string; date: Date }>();
    const seenEmails = new Map<string, { id: string; date: Date }>();

    for (const lead of sortedAll) {
      const phone = normalizePhone(lead.phone);
      const email = lead.customFields?.Email?.toLowerCase() || lead.customFields?.email?.toLowerCase() || "";
      const leadDate = parseLeadDate(lead.date);

      let dupOfId: string | null = null;

      if (phone && phone.length >= 6 && leadDate) {
        const seen = seenPhones.get(phone);
        if (seen && seen.id !== lead.submissionId && (leadDate.getTime() - seen.date.getTime()) <= DUPLICATE_WINDOW_MS) {
          dupOfId = seen.id;
        }
        // Always update to latest occurrence so the window slides
        if (!seen || (leadDate.getTime() >= seen.date.getTime())) {
          seenPhones.set(phone, { id: lead.submissionId, date: leadDate });
        }
      }

      if (email && email.includes("@") && leadDate) {
        const seen = seenEmails.get(email);
        if (seen && seen.id !== lead.submissionId && (leadDate.getTime() - seen.date.getTime()) <= DUPLICATE_WINDOW_MS) {
          dupOfId = dupOfId || seen.id;
        }
        if (!seen || (leadDate.getTime() >= seen.date.getTime())) {
          seenEmails.set(email, { id: lead.submissionId, date: leadDate });
        }
      }

      if (dupOfId) duplicateMap.set(lead.submissionId, dupOfId);
    }

    // Mark duplicates
    const markedLeads = allLeads.map((l) => ({
      ...l,
      isDuplicate: duplicateMap.has(l.submissionId),
      duplicateOfId: duplicateMap.get(l.submissionId) || undefined,
    }));

    let filteredLeads: (LeadDetail & { isDuplicate: boolean; duplicateOfId?: string })[];
    if (filter === "reviewed") {
      filteredLeads = markedLeads.filter((l) => configReviewedStatuses.has(l.qualified));
    } else if (filter === "all") {
      filteredLeads = markedLeads;
    } else {
      // "unreviewed" = not in any known reviewed status
      filteredLeads = markedLeads.filter((l) => !configReviewedStatuses.has(l.qualified));
    }

    filteredLeads.sort((a, b) => b.date.localeCompare(a.date));
    const latestLeads = limit > 0 ? filteredLeads.slice(0, limit) : filteredLeads;

    // Collect unique source labels
    const availableSources = [...new Set(markedLeads.map((l) => l.source).filter(Boolean))];

    // Build custom field icon map
    const customFieldIcons: Record<string, string> = {};
    for (const cc of customColumns) {
      if (cc.icon) customFieldIcons[cc.name] = cc.icon;
    }

    return new Response(JSON.stringify({ leads: latestLeads, sources: availableSources, customFieldIcons }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("fetch-leads-detail error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
