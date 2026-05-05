import { corsHeaders } from "../_shared/cors.ts";
import { getClientSources, parseClientSlug } from "../_shared/client-sources.ts";

const FALLBACK_RATE = 25.2;
const rateCache = new Map<string, number>();

async function loadYearRates(year: number): Promise<void> {
  try {
    const url = `https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/rok.txt?rok=${year}`;
    const res = await fetch(url, { headers: { Accept: "text/plain" } });
    if (!res.ok) return;

    const text = await res.text();
    const lines = text.split("\n");
    if (lines.length < 2) return;

    const headers = lines[0].split("|");
    let eurColIdx = -1;
    for (let i = 1; i < headers.length; i++) {
      if (headers[i].includes("EUR")) { eurColIdx = i; break; }
    }
    if (eurColIdx === -1) return;

    const eurHeader = headers[eurColIdx].trim();
    const amountMatch = eurHeader.match(/^(\d+)/);
    const amount = amountMatch ? parseInt(amountMatch[1], 10) : 1;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = line.split("|");
      if (cols.length <= eurColIdx) continue;
      const dateParts = cols[0].split(".");
      if (dateParts.length !== 3) continue;
      const isoDate = `${dateParts[2]}-${dateParts[1].padStart(2, "0")}-${dateParts[0].padStart(2, "0")}`;
      const rateStr = cols[eurColIdx]?.trim().replace(",", ".");
      const rate = parseFloat(rateStr);
      if (!isNaN(rate) && rate > 0) {
        rateCache.set(isoDate, rate / amount);
      }
    }
  } catch (e) {
    console.error(`Failed to load rates for ${year}:`, e);
  }
}

function getRate(dateStr: string): number {
  const isoDate = dateStr.substring(0, 10);
  if (rateCache.has(isoDate)) return rateCache.get(isoDate)!;
  const d = new Date(isoDate);
  for (let i = 1; i <= 7; i++) {
    const prev = new Date(d);
    prev.setDate(prev.getDate() - i);
    const key = prev.toISOString().substring(0, 10);
    if (rateCache.has(key)) return rateCache.get(key)!;
  }
  return FALLBACK_RATE;
}

async function ensureRatesLoaded(minYear: number, maxYear: number): Promise<void> {
  const promises: Promise<void>[] = [];
  for (let y = minYear; y <= maxYear; y++) {
    const janKey = `${y}-01-02`;
    if (!rateCache.has(janKey)) promises.push(loadYearRates(y));
  }
  await Promise.all(promises);
}

function parseCsvLine(line: string, delimiter = ";"): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
      continue;
    }
    if (char === delimiter && !inQuotes) { result.push(current.trim()); current = ""; continue; }
    current += char;
  }
  result.push(current.trim());
  return result;
}

function toNumber(raw?: string): number {
  if (!raw) return 0;
  return parseFloat(raw.replace(/\s/g, "").replace(",", ".")) || 0;
}

async function fetchCsvWithRetry(url: string, attempts = 4): Promise<string> {
  let lastError = "Unknown error";
  for (let i = 1; i <= attempts; i++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "text/csv,text/plain,*/*", "User-Agent": "LovableCloud-FetchOrders/1.0", "Cache-Control": "no-cache" },
        cache: "no-store",
      });
      if (response.ok) return await response.text();
      lastError = `HTTP ${response.status}`;
      if (i < attempts) await new Promise((r) => setTimeout(r, i * 1200));
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (i < attempts) await new Promise((r) => setTimeout(r, i * 1200));
    } finally { clearTimeout(timeout); }
  }
  throw new Error(`Failed to fetch CSV after ${attempts} attempts: ${lastError}`);
}

const lastSuccessfulOrders = new Map<string, unknown[]>();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let clientSlug = "unknown";
  try {
    const body = await req.json();
    clientSlug = parseClientSlug(body);
    const { urls, config } = await getClientSources(clientSlug, "orders");

    if (urls.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const delimiter = (config?.csv_delimiter as string) || ";";
    const csvText = await fetchCsvWithRetry(urls[0]);

    const lines = csvText.replace(/^\uFEFF/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    if (lines.length < 2) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedHeaders = parseCsvLine(lines[0], delimiter).map((h) => h.replace(/"/g, "").trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
    const findCol = (...names: string[]) => {
      const nn = names.map((n) => n.toLowerCase().replace(/[^a-z0-9]/g, ""));
      return normalizedHeaders.findIndex((h) => nn.includes(h));
    };

    const dateIdx = findCol("date");
    const currencyIdx = findCol("currencyCode", "currency", "mena");
    const withVatIdx = findCol("totalPriceWithVat");
    const withoutVatIdx = findCol("totalPriceWithoutVat");
    const vatIdx = findCol("totalPriceVat");
    const purchaseIdx = findCol("orderPurchasePrice");

    let minYear = 9999, maxYear = 0, hasEur = false;
    for (const line of lines.slice(1)) {
      const vals = parseCsvLine(line, delimiter);
      const cur = currencyIdx >= 0 ? vals[currencyIdx]?.trim().toUpperCase() : "CZK";
      if (cur === "EUR") {
        hasEur = true;
        const dateVal = dateIdx >= 0 ? vals[dateIdx]?.trim() : "";
        const y = parseInt(dateVal.substring(0, 4), 10);
        if (!isNaN(y)) { if (y < minYear) minYear = y; if (y > maxYear) maxYear = y; }
      }
    }

    if (hasEur && minYear <= maxYear) {
      await ensureRatesLoaded(minYear, maxYear);
    }

    const dedupe = new Set<string>();
    const orders = lines.slice(1).map((line) => {
      const values = parseCsvLine(line, delimiter);
      const date = dateIdx >= 0 ? (values[dateIdx] || "").trim() : "";
      const currency = (currencyIdx >= 0 ? values[currencyIdx] : "CZK")?.trim().toUpperCase();
      const rate = currency === "EUR" ? getRate(date) : 1;
      return {
        date, currency,
        totalPriceWithVat: toNumber(values[withVatIdx]) * rate,
        totalPriceWithoutVat: toNumber(values[withoutVatIdx]) * rate,
        totalPriceVat: toNumber(values[vatIdx]) * rate,
        orderPurchasePrice: toNumber(values[purchaseIdx]) * rate,
      };
    }).filter((o) => o.date).filter((o) => {
      const key = `${o.date}|${o.currency}|${o.totalPriceWithVat.toFixed(2)}|${o.totalPriceWithoutVat.toFixed(2)}`;
      if (dedupe.has(key)) return false;
      dedupe.add(key);
      return true;
    });

    lastSuccessfulOrders.set(clientSlug, orders);

    return new Response(JSON.stringify(orders), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("fetch-orders error:", message);

    return new Response(JSON.stringify(lastSuccessfulOrders.get(clientSlug) || []), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Data-Warning": `upstream-failed:${message}` },
      status: 200,
    });
  }
});
