/**
 * Shared eshop CSV parser used by sync-eshop-data, fetch-eshop-budget (fallback),
 * and manage-eshop-config (list_campaigns).
 */

export interface EshopCsvRow {
  web: string;
  date: string;
  source: string;
  medium: string;
  cost: number;
  campaignName: string;
}

export interface ParsedEshopRow {
  web: string;
  date: string; // YYYY-MM-DD
  channel: string;
  campaignName: string;
  cost: number;
}

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

function parseHeaders(headerLine: string): Record<string, number> {
  const headers: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of headerLine) {
    if (char === '"') inQuotes = !inQuotes;
    else if (char === "," && !inQuotes) { headers.push(current.trim().toLowerCase().replace(/\s+/g, "_")); current = ""; }
    else current += char;
  }
  headers.push(current.trim().toLowerCase().replace(/\s+/g, "_"));
  const hMap: Record<string, number> = {};
  headers.forEach((h, i) => { if (h) hMap[h] = i; });
  return hMap;
}

/** Parse a date string (DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD) into YYYY-MM-DD or null */
export function parseDate(dateStr: string): string | null {
  let m = dateStr.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) {
    const y = parseInt(m[3]);
    const mo = parseInt(m[2]);
    const d = parseInt(m[1]);
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return dateStr;
  return null;
}

export interface ParseOptions {
  webFilter?: string | null;
  excludedCampaigns?: string[];
}

/**
 * Parse eshop CSV text into structured rows.
 * Returns all parsed rows (no date filtering — caller decides).
 */
export function parseEshopCsv(csvText: string, options?: ParseOptions): ParsedEshopRow[] {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return [];

  const hMap = parseHeaders(lines[0]);
  const webFilter = options?.webFilter || null;
  const excludedCampaigns = (options?.excludedCampaigns || []).map(s => s.toLowerCase()).filter(Boolean);

  const rows: ParsedEshopRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const v = parseCsvLine(lines[i]);
    const web = v[hMap.web ?? 0] || "";
    const dateRaw = v[hMap.date ?? 1] || "";
    const source = v[hMap.source ?? 2] || "";
    const cost = parseFloat(v[hMap.cost ?? 4] || "0") || 0;
    const campaignName = v[hMap.campaign_name ?? hMap.campaignname ?? 7] || "";

    if (!dateRaw) continue;
    if (webFilter && web !== webFilter) continue;
    if (excludedCampaigns.length > 0) {
      const cn = campaignName.toLowerCase();
      if (excludedCampaigns.some(exc => cn.includes(exc))) continue;
    }

    const dateKey = parseDate(dateRaw);
    if (!dateKey) continue;

    rows.push({
      web,
      date: dateKey,
      channel: source.toLowerCase() || "other",
      campaignName,
      cost,
    });
  }

  return rows;
}
