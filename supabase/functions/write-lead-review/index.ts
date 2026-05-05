import { corsHeaders } from "../_shared/cors.ts";
import { WRITEBACK_FIELDS, WRITEBACK_STATUS } from "../_shared/writeback-contract.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function sendWriteback(url: string, payload: string): Promise<{ url: string; success: boolean; error?: string }> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: payload,
      redirect: "follow",
    });
    const result = await response.text();
    if (result.trim().startsWith("<!") || result.includes("<html")) {
      return { url, success: false, error: "Apps Script returned HTML error page" };
    }
    try {
      const parsed = JSON.parse(result);
      return { url, success: !!parsed.success, error: parsed.error };
    } catch {
      return { url, success: false, error: `Unexpected response: ${result.slice(0, 200)}` };
    }
  } catch (err) {
    return { url, success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { submissionId, status, clientSlug } = await req.json();

    if (!submissionId || !status) {
      return new Response(JSON.stringify({ error: "Missing submissionId or status" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Collect all writeback URLs from per-source configs
    const writebackUrls: string[] = [];

    if (clientSlug) {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { data: client } = await supabaseAdmin
        .from("clients")
        .select("id")
        .eq("slug", clientSlug)
        .single();

      if (client) {
        const { data: sources } = await supabaseAdmin
          .from("client_data_sources")
          .select("config")
          .eq("client_id", client.id)
          .eq("source_type", "leads");

        for (const src of sources || []) {
          const cfg = (src.config || {}) as Record<string, unknown>;
          if (cfg.writeback_url && typeof cfg.writeback_url === "string") {
            writebackUrls.push(cfg.writeback_url);
          }
        }
      }
    }

    // Fallback to global secret
    if (writebackUrls.length === 0) {
      const globalUrl = Deno.env.get("GOOGLE_APPS_SCRIPT_URL");
      if (globalUrl) writebackUrls.push(globalUrl);
    }

    if (writebackUrls.length === 0) {
      return new Response(JSON.stringify({ 
        error: "No Apps Script URL configured for this client. Set it in client settings (CRM Writeback tab)." 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Writing review for client=${clientSlug}, submissionId=${submissionId}, status=${status}, targets=${writebackUrls.length}`);

    const mappedStatus = WRITEBACK_STATUS[status] ?? "not_qualified";
    const payload = JSON.stringify({
      [WRITEBACK_FIELDS.submissionId]: submissionId,
      [WRITEBACK_FIELDS.status]: mappedStatus,
    });

    // Send to all writeback URLs in parallel
    const results = await Promise.all(writebackUrls.map((url) => sendWriteback(url, payload)));
    const anySuccess = results.some((r) => r.success);

    console.log(`Writeback results: ${JSON.stringify(results)}`);

    return new Response(JSON.stringify({ success: anySuccess, results }), {
      status: anySuccess ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("write-lead-review error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
