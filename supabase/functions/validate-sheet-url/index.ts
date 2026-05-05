import { corsHeaders } from "../_shared/cors.ts";
import { normalizeSheetUrl } from "../_shared/client-sources.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const rawUrl = (body.url as string) || "";

    if (!rawUrl.trim()) {
      return new Response(JSON.stringify({ ok: false, error: "empty_url", message: "URL je prázdné" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check it's a Google Sheets URL
    if (!rawUrl.includes("docs.google.com/spreadsheets")) {
      return new Response(JSON.stringify({ ok: false, error: "not_sheets", message: "URL není odkaz na Google Sheets" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedUrl = normalizeSheetUrl(rawUrl);

    // Try to fetch
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    try {
      response = await fetch(normalizedUrl, { signal: controller.signal, cache: "no-store" });
    } catch (e) {
      clearTimeout(timeout);
      return new Response(JSON.stringify({
        ok: false,
        error: "fetch_failed",
        message: "Nepodařilo se připojit k Google Sheets. Zkontrolujte URL.",
        normalizedUrl,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    clearTimeout(timeout);

    if (!response.ok) {
      let message = "";
      if (response.status === 401 || response.status === 403) {
        message = `Tabulka není veřejně sdílená. Nastavte sdílení na "Kdokoli s odkazem" → "Čtenář".`;
      } else if (response.status === 400) {
        message = `List (gid) nebyl nalezen. Zkontrolujte, že odkazujete na správný list v tabulce.`;
      } else if (response.status === 404) {
        message = "Tabulka nebyla nalezena. Zkontrolujte, že URL je správné.";
      } else {
        message = `Google Sheets vrátil chybu ${response.status}.`;
      }

      return new Response(JSON.stringify({
        ok: false,
        error: "http_error",
        status: response.status,
        message,
        normalizedUrl,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const csvText = await response.text();
    const lines = csvText.trim().split("\n");
    const rowCount = Math.max(0, lines.length - 1); // minus header

    // Parse first line as headers
    const headerLine = lines[0] || "";
    const headers: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const char of headerLine) {
      if (char === '"') inQuotes = !inQuotes;
      else if (char === "," && !inQuotes) { headers.push(current.trim()); current = ""; }
      else current += char;
    }
    headers.push(current.trim());

    return new Response(JSON.stringify({
      ok: true,
      normalizedUrl,
      rowCount,
      columns: headers.length,
      headers: headers.slice(0, 15), // first 15 headers
      preview: lines.length > 1 ? lines[1].substring(0, 200) : null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: "server_error", message: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
