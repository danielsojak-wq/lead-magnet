import { corsHeaders } from "../_shared/cors.ts";
import { getClientSources, parseClientSlug } from "../_shared/client-sources.ts";
import { triggerClientSync } from "../_shared/trigger-sync.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const clientSlug = parseClientSlug(body);
    const action = body.action || "list"; // "list" | "add" | "remove"

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (action === "add" && body.campaign_name) {
      const { error } = await supabaseAdmin
        .from("client_lead_campaigns")
        .upsert(
          { client_slug: clientSlug, campaign_name: body.campaign_name },
          { onConflict: "client_slug,campaign_name" }
        );
      if (error) throw error;
      // Trigger immediate cache resync so dashboard reflects the new filter
      // without waiting for the hourly cron.
      // @ts-ignore Deno runtime
      EdgeRuntime.waitUntil(triggerClientSync("sync-leadgen-data", clientSlug));
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "remove" && body.campaign_name) {
      const { error } = await supabaseAdmin
        .from("client_lead_campaigns")
        .delete()
        .eq("client_slug", clientSlug)
        .eq("campaign_name", body.campaign_name);
      if (error) throw error;
      // @ts-ignore Deno runtime
      EdgeRuntime.waitUntil(triggerClientSync("sync-leadgen-data", clientSlug));
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // action === "list": return all campaign names from sheet + selected ones
    // 1. Fetch unique campaign names from marketing_costs sheet
    let allCampaigns: string[] = [];
    try {
      const { urls, config } = await getClientSources(clientSlug, "marketing_costs");
      const webFilter = (config?.web_filter as string) || null;

      if (urls.length > 0) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);
        let response: Response;
        try {
          response = await fetch(urls[0], { signal: controller.signal });
        } finally {
          clearTimeout(timeout);
        }

        if (response.ok) {
          const csvText = await response.text();
          const lines = csvText.trim().split("\n");

          // Parse headers
          const headerLine = lines[0] || "";
          const headers: string[] = [];
          let hCurrent = "";
          let hInQuotes = false;
          for (const char of headerLine) {
            if (char === '"') { hInQuotes = !hInQuotes; }
            else if (char === "," && !hInQuotes) { headers.push(hCurrent.trim().toLowerCase().replace(/\s+/g, "_")); hCurrent = ""; }
            else { hCurrent += char; }
          }
          headers.push(hCurrent.trim().toLowerCase().replace(/\s+/g, "_"));
          const headerMap: Record<string, number> = {};
          headers.forEach((h, i) => { if (h) headerMap[h] = i; });

          const webIdx = headerMap.web ?? 0;
          const campaignIdx = headerMap.campaign_name ?? headerMap.campaignname ?? 7;

          const campaignSet = new Set<string>();
          for (let i = 1; i < lines.length; i++) {
            const values: string[] = [];
            let current = "";
            let inQuotes = false;
            for (const char of lines[i]) {
              if (char === '"') { inQuotes = !inQuotes; }
              else if (char === "," && !inQuotes) { values.push(current.trim()); current = ""; }
              else { current += char; }
            }
            values.push(current.trim());

            const web = values[webIdx] || "";
            if (webFilter && web !== webFilter) continue;

            const name = values[campaignIdx] || "";
            if (name) campaignSet.add(name);
          }
          allCampaigns = Array.from(campaignSet).sort();
        }
      }
    } catch (e) {
      console.error("Failed to fetch campaigns from sheet:", e);
    }

    // 2. Fetch selected lead campaigns from DB
    const { data: selected } = await supabaseAdmin
      .from("client_lead_campaigns")
      .select("campaign_name")
      .eq("client_slug", clientSlug);

    const selectedNames = new Set((selected || []).map((r: any) => r.campaign_name));

    const result = allCampaigns.map((name) => ({
      name,
      isLead: selectedNames.has(name),
    }));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
