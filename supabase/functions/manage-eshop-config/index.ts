import { corsHeaders } from "../_shared/cors.ts";
import { normalizeSheetUrl } from "../_shared/client-sources.ts";
import { triggerClientSync } from "../_shared/trigger-sync.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = body.action as string;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // "list" action: return all clients with eshop_costs source (no client_slug needed)
    if (action === "list") {
      const { data: allClients } = await supabaseAdmin
        .from("clients")
        .select("id, slug, name, display_name");

      const { data: eshopSources } = await supabaseAdmin
        .from("client_data_sources")
        .select("client_id")
        .eq("source_type", "eshop_costs");

      const eshopClientIds = new Set((eshopSources || []).map((s: any) => s.client_id));

      const eshopClients = (allClients || []).filter((c: any) => eshopClientIds.has(c.id));
      const allClientsList = (allClients || []).map((c: any) => ({
        slug: c.slug,
        name: c.name,
        display_name: c.display_name,
      }));

      return new Response(JSON.stringify({
        eshopClients: eshopClients.map((c: any) => ({
          slug: c.slug,
          name: c.name,
          display_name: c.display_name,
        })),
        allClients: allClientsList,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientSlug = body.client_slug as string;
    if (!clientSlug) throw new Error("Missing client_slug");

    // Get client
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id, slug, name, display_name")
      .eq("slug", clientSlug)
      .single();

    if (!client) throw new Error("Client not found");

    if (action === "get") {
      // Get eshop_costs data source
      const { data: sources } = await supabaseAdmin
        .from("client_data_sources")
        .select("*")
        .eq("client_id", client.id)
        .eq("source_type", "eshop_costs");

      // Get budget targets for current month, fallback to most recent month
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      let { data: targets } = await supabaseAdmin
        .from("eshop_budget_targets")
        .select("*")
        .eq("client_slug", clientSlug)
        .eq("month", currentMonth)
        .eq("year", currentYear);

      // If no targets for current month, copy from most recent month
      if (!targets || targets.length === 0) {
        const { data: latestTargets } = await supabaseAdmin
          .from("eshop_budget_targets")
          .select("*")
          .eq("client_slug", clientSlug)
          .order("year", { ascending: false })
          .order("month", { ascending: false })
          .limit(20);

        if (latestTargets && latestTargets.length > 0) {
          // Get the most recent month/year combo
          const latestMonth = latestTargets[0].month;
          const latestYear = latestTargets[0].year;
          const fromPrevious = latestTargets.filter(
            (t) => t.month === latestMonth && t.year === latestYear
          );

          // Auto-copy to current month
          const newRows = fromPrevious.map((t) => ({
            client_slug: clientSlug,
            channel: t.channel,
            target_amount: t.target_amount,
            month: currentMonth,
            year: currentYear,
          }));

          if (newRows.length > 0) {
            await supabaseAdmin.from("eshop_budget_targets").insert(newRows);
            // Re-fetch the newly inserted targets
            const { data: freshTargets } = await supabaseAdmin
              .from("eshop_budget_targets")
              .select("*")
              .eq("client_slug", clientSlug)
              .eq("month", currentMonth)
              .eq("year", currentYear);
            targets = freshTargets || [];
          }
        }
      }

      return new Response(JSON.stringify({
        client,
        source: sources?.[0] || null,
        targets: targets || [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list_campaigns") {
      // Fetch the sheet and extract unique campaign names
      const { data: sources } = await supabaseAdmin
        .from("client_data_sources")
        .select("*")
        .eq("client_id", client.id)
        .eq("source_type", "eshop_costs");

      const source = sources?.[0];
      if (!source || !source.source_urls?.length) {
        return new Response(JSON.stringify([]), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const cfg = (source.config || {}) as Record<string, unknown>;
      const webFilter = (cfg.web_filter as string) || "";
      const excludedRaw = (cfg.excluded_campaigns as string) || "";
      const excludedSet = new Set(
        excludedRaw.split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean)
      );

      const csvUrl = normalizeSheetUrl(source.source_urls[0]);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      let csvText: string;
      try {
        const resp = await fetch(csvUrl, { signal: controller.signal });
        if (!resp.ok) throw new Error("fetch failed");
        csvText = await resp.text();
      } finally {
        clearTimeout(timeout);
      }

      const lines = csvText.trim().split("\n");
      // Parse headers
      const headerLine = lines[0] || "";
      const headers: string[] = [];
      let hCurrent = "";
      let hInQuotes = false;
      for (const char of headerLine) {
        if (char === '"') hInQuotes = !hInQuotes;
        else if (char === "," && !hInQuotes) { headers.push(hCurrent.trim().toLowerCase().replace(/\s+/g, "_")); hCurrent = ""; }
        else hCurrent += char;
      }
      headers.push(hCurrent.trim().toLowerCase().replace(/\s+/g, "_"));
      const hMap: Record<string, number> = {};
      headers.forEach((h, i) => { if (h) hMap[h] = i; });

      const parseCsvLine = (line: string): string[] => {
        const values: string[] = [];
        let current = "";
        let inQ = false;
        for (const char of line) {
          if (char === '"') inQ = !inQ;
          else if (char === "," && !inQ) { values.push(current.trim()); current = ""; }
          else current += char;
        }
        values.push(current.trim());
        return values;
      };

      const campaignNames = new Set<string>();
      for (let i = 1; i < lines.length; i++) {
        const v = parseCsvLine(lines[i]);
        const web = v[hMap.web ?? 0] || "";
        if (webFilter && web !== webFilter) continue;
        const cn = v[hMap.campaign_name ?? hMap.campaignname ?? 7] || "";
        if (cn) campaignNames.add(cn);
      }

      const result = Array.from(campaignNames).sort().map((name) => ({
        name,
        included: !excludedSet.has(name.toLowerCase()),
      }));

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list_channels") {
      // Use raw SQL for DISTINCT to avoid 1000-row default limit
      const { data: distinctRows, error: chErr } = await supabaseAdmin
        .rpc("get_distinct_eshop_channels" as any, { slug: clientSlug });

      // Fallback: if RPC doesn't exist yet, query with high limit
      if (!chErr && distinctRows && (distinctRows as any[]).length > 0) {
        const channels = (distinctRows as any[]).map((r: any) => r.channel).filter(Boolean).sort();
        return new Response(JSON.stringify(channels), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fallback: paginated select
      const allChannels = new Set<string>();
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data: page } = await supabaseAdmin
          .from("cached_eshop_costs")
          .select("channel")
          .eq("client_slug", clientSlug)
          .range(from, from + pageSize - 1);
        if (!page || page.length === 0) break;
        for (const row of page) { if (row.channel) allChannels.add(row.channel); }
        if (page.length < pageSize) break;
        from += pageSize;
      }

      if (allChannels.size > 0) {
        return new Response(JSON.stringify(Array.from(allChannels).sort()), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fallback: parse CSV for source column
      const { data: sources } = await supabaseAdmin
        .from("client_data_sources")
        .select("*")
        .eq("client_id", client.id)
        .eq("source_type", "eshop_costs");

      const source = sources?.[0];
      if (!source || !source.source_urls?.length) {
        return new Response(JSON.stringify([]), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const cfg = (source.config || {}) as Record<string, unknown>;
      const wf = (cfg.web_filter as string) || "";
      const csvUrl = normalizeSheetUrl(source.source_urls[0]);
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 15000);
      let csv: string;
      try {
        const r = await fetch(csvUrl, { signal: ctrl.signal });
        if (!r.ok) throw new Error("fetch failed");
        csv = await r.text();
      } finally {
        clearTimeout(to);
      }

      const csvLines = csv.trim().split("\n");
      const hdr = csvLines[0] || "";
      const hdrs: string[] = [];
      let cur = "", inQ = false;
      for (const c of hdr) {
        if (c === '"') inQ = !inQ;
        else if (c === "," && !inQ) { hdrs.push(cur.trim().toLowerCase().replace(/\s+/g, "_")); cur = ""; }
        else cur += c;
      }
      hdrs.push(cur.trim().toLowerCase().replace(/\s+/g, "_"));
      const hIdx: Record<string, number> = {};
      hdrs.forEach((h, i) => { if (h) hIdx[h] = i; });

      const chSet = new Set<string>();
      const pLine = (line: string): string[] => {
        const vals: string[] = []; let c2 = "", q2 = false;
        for (const ch of line) {
          if (ch === '"') q2 = !q2;
          else if (ch === "," && !q2) { vals.push(c2.trim()); c2 = ""; }
          else c2 += ch;
        }
        vals.push(c2.trim()); return vals;
      };
      for (let i = 1; i < csvLines.length; i++) {
        const v = pLine(csvLines[i]);
        const web = v[hIdx.web ?? 0] || "";
        if (wf && web !== wf) continue;
        const src = v[hIdx.source ?? 2] || "";
        if (src) chSet.add(src.toLowerCase());
      }

      return new Response(JSON.stringify(Array.from(chSet).sort()), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update") {
      const sourceUrl = body.source_url as string || "";
      const excludedCampaigns = body.excluded_campaigns as string || "";
      const budgetMode = body.budget_mode as string || "total";
      const webFilter = body.web_filter as string || "";
      const currency = body.currency as string || "CZK";
      const budgetTargets = body.budget_targets as Array<{ channel: string; target_amount: number }> || [];
      const month = body.month as number;
      const year = body.year as number;

      // Upsert data source
      const normalizedUrl = normalizeSheetUrl(sourceUrl);

      // Delete existing eshop_costs source for this client
      await supabaseAdmin
        .from("client_data_sources")
        .delete()
        .eq("client_id", client.id)
        .eq("source_type", "eshop_costs");

      // Insert new source if URL provided
      if (normalizedUrl) {
        await supabaseAdmin
          .from("client_data_sources")
          .insert({
            client_id: client.id,
            source_type: "eshop_costs",
            source_urls: [normalizedUrl],
            config: {
              excluded_campaigns: excludedCampaigns,
              budget_mode: budgetMode,
              web_filter: webFilter || undefined,
              currency: currency !== "CZK" ? currency : undefined,
            },
          });
      }

      // Upsert budget targets
      if (month && year && budgetTargets.length > 0) {
        // Delete existing targets for this month
        await supabaseAdmin
          .from("eshop_budget_targets")
          .delete()
          .eq("client_slug", clientSlug)
          .eq("month", month)
          .eq("year", year);

        // Insert new targets
        const rows = budgetTargets
          .filter((t) => t.target_amount > 0)
          .map((t) => ({
            client_slug: clientSlug,
            channel: t.channel,
            target_amount: t.target_amount,
            month,
            year,
          }));

        if (rows.length > 0) {
          await supabaseAdmin.from("eshop_budget_targets").insert(rows);
        }
      }

      // Trigger immediate cache resync so the dashboard reflects new
      // excluded_campaigns / web_filter / source URL right away.
      // @ts-ignore Deno runtime
      EdgeRuntime.waitUntil(triggerClientSync("sync-eshop-data", clientSlug));

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
