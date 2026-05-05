import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

/*
  fetch-home-summary
  Returns aggregated data for the home dashboard:
  - ecommerceAlerts: clients with warn/off_target pacing
  - leadgenInactive: clients with no leads for N+ days
  - stats: total clients, total spend this month, total leads this month
  
  Body: { slugs?: string[], inactive_days?: number }
  If slugs provided, filters to those clients only (for AM).
*/

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const filterSlugs: string[] | null = body.slugs || null;
    const inactiveDays: number = body.inactive_days || 7;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Get all clients
    const { data: allClients } = await supabaseAdmin
      .from("clients")
      .select("id, slug, name, display_name");

    if (!allClients || allClients.length === 0) {
      return new Response(JSON.stringify({ ecommerceAlerts: [], leadgenInactive: [], stats: { totalClients: 0, totalSpend: 0, totalLeads: 0 } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Get data sources
    const { data: sources } = await supabaseAdmin
      .from("client_data_sources")
      .select("client_id, source_type, source_urls, config");

    const sourceMap = new Map<string, Array<{ source_type: string; source_urls: string[]; config: Record<string, unknown> | null }>>();
    for (const s of (sources || [])) {
      const arr = sourceMap.get(s.client_id) || [];
      arr.push(s as any);
      sourceMap.set(s.client_id, arr);
    }

    // Filter clients if slugs provided
    const relevantClients = filterSlugs
      ? allClients.filter(c => filterSlugs.includes(c.slug))
      : allClients;

    // Categorize clients
    const eshopClients = relevantClients.filter(c => {
      const cs = sourceMap.get(c.id) || [];
      return cs.some(s => s.source_type === "eshop_costs");
    });

    const leadgenClients = relevantClients.filter(c => {
      const cs = sourceMap.get(c.id) || [];
      return cs.some(s => s.source_type === "leads" || s.source_type === "marketing_costs" || s.source_type === "ad_costs");
    });

    // 3. Fetch ecommerce pacing for eshop clients (call fetch-eshop-budget internally)
    const baseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const ecommerceAlerts: Array<{ slug: string; name: string; pacing: string; deviationPct: number; spent: number; target: number; currency: string }> = [];
    let totalSpend = 0;

    await Promise.all(
      eshopClients.map(async (client) => {
        try {
          const res = await fetch(`${baseUrl}/functions/v1/fetch-eshop-budget`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ client_slug: client.slug }),
          });
          const data = await res.json();
          if (data?.total && !data.error) {
            totalSpend += data.total.spentThisMonth || 0;
            if (data.total.pacing === "warn" || data.total.pacing === "off_target") {
              ecommerceAlerts.push({
                slug: client.slug,
                name: client.display_name || client.name,
                pacing: data.total.pacing,
                deviationPct: data.total.deviationPct,
                spent: data.total.spentThisMonth,
                target: data.total.target,
                currency: data.currency || "CZK",
              });
            }
          }
        } catch (e) {
          console.error(`Error fetching eshop budget for ${client.slug}:`, e);
        }
      })
    );

    // Sort alerts: off_target first, then warn
    ecommerceAlerts.sort((a, b) => {
      if (a.pacing === "off_target" && b.pacing !== "off_target") return -1;
      if (a.pacing !== "off_target" && b.pacing === "off_target") return 1;
      return Math.abs(b.deviationPct) - Math.abs(a.deviationPct);
    });

    // 4. Fetch leads for leadgen clients to find inactive ones
    const leadgenInactive: Array<{ slug: string; name: string; lastLeadDaysAgo: number | null }> = [];
    let totalLeads = 0;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    async function fetchCsvSafe(url: string): Promise<string | null> {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
        clearTimeout(timeout);
        if (!res.ok) return null;
        return await res.text();
      } catch {
        return null;
      }
    }

    function parseDate(dateStr: string): Date | null {
      if (!dateStr) return null;
      const s = dateStr.trim();
      let m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
      if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
      m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
      m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (m) return new Date(+m[3], +m[1] - 1, +m[2]);
      return null;
    }

    function parseCsvRows(csvText: string): string[][] {
      const lines = csvText.trim().split("\n");
      return lines.slice(1).map(line => {
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
      });
    }

    function parseHeaderMap(csvText: string): Record<string, number> {
      const firstLine = csvText.trim().split("\n")[0] || "";
      const values: string[] = [];
      let current = "";
      let inQuotes = false;
      for (const char of firstLine) {
        if (char === '"') inQuotes = !inQuotes;
        else if (char === "," && !inQuotes) { values.push(current.trim().toLowerCase().replace(/\s+/g, "_")); current = ""; }
        else current += char;
      }
      values.push(current.trim().toLowerCase().replace(/\s+/g, "_"));
      const map: Record<string, number> = {};
      values.forEach((h, i) => { if (h) map[h] = i; });
      return map;
    }

    await Promise.all(
      leadgenClients.map(async (client) => {
        try {
          const clientSources = sourceMap.get(client.id) || [];
          const leadSources = clientSources.filter(s => s.source_type === "leads");
          const leadUrls = leadSources.flatMap(s => s.source_urls || []);

          if (leadUrls.length === 0) {
            leadgenInactive.push({
              slug: client.slug,
              name: client.display_name || client.name,
              lastLeadDaysAgo: null,
            });
            return;
          }

          const csvResults = await Promise.all(leadUrls.map(fetchCsvSafe));
          let latestDate: Date | null = null;
          let monthLeadCount = 0;

          for (const csv of csvResults) {
            if (!csv) continue;
            const headerMap = parseHeaderMap(csv);
            const dateIndex = headerMap.date ?? 1;
            const rows = parseCsvRows(csv);
            for (const row of rows) {
              const d = parseDate(row[dateIndex] || "");
              if (!d) continue;
              if (d > (latestDate || new Date(0))) latestDate = d;
              // Count leads this month
              if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
                monthLeadCount++;
              }
            }
          }

          totalLeads += monthLeadCount;

          let lastLeadDaysAgo: number | null = null;
          if (latestDate) {
            lastLeadDaysAgo = Math.max(0, Math.floor((now.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24)));
          }

          if (lastLeadDaysAgo === null || lastLeadDaysAgo >= inactiveDays) {
            leadgenInactive.push({
              slug: client.slug,
              name: client.display_name || client.name,
              lastLeadDaysAgo,
            });
          }
        } catch (e) {
          console.error(`Error processing leads for ${client.slug}:`, e);
        }
      })
    );

    // Sort inactive: null (never) first, then by days desc
    leadgenInactive.sort((a, b) => {
      if (a.lastLeadDaysAgo === null && b.lastLeadDaysAgo !== null) return -1;
      if (a.lastLeadDaysAgo !== null && b.lastLeadDaysAgo === null) return 1;
      return (b.lastLeadDaysAgo || 0) - (a.lastLeadDaysAgo || 0);
    });

    // 5. Also count leadgen marketing costs from cache (fast DB query instead of CSV)
    const monthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    const monthEnd = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-01`;

    const leadgenSlugs = leadgenClients.map(c => c.slug);
    if (leadgenSlugs.length > 0) {
      try {
        const { data: mktCosts } = await supabaseAdmin
          .from("cached_marketing_costs")
          .select("cost")
          .in("client_slug", leadgenSlugs)
          .gte("date", monthStart)
          .lt("date", monthEnd);
        if (mktCosts) {
          for (const r of mktCosts) totalSpend += r.cost || 0;
        }

        const { data: adCosts } = await supabaseAdmin
          .from("cached_ad_costs")
          .select("cost")
          .in("client_slug", leadgenSlugs)
          .gte("date", monthStart)
          .lt("date", monthEnd);
        if (adCosts) {
          for (const r of adCosts) totalSpend += r.cost || 0;
        }
      } catch (e) {
        console.error("Error fetching cached leadgen costs:", e);
      }
    }

    const result = {
      ecommerceAlerts,
      leadgenInactive,
      stats: {
        totalClients: relevantClients.length,
        totalSpend: Math.round(totalSpend),
        totalLeads,
      },
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("fetch-home-summary error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
