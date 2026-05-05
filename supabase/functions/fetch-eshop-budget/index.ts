import { corsHeaders } from "../_shared/cors.ts";
import { getClientSources, parseClientSlug } from "../_shared/client-sources.ts";
import { parseEshopCsv, type ParsedEshopRow } from "../_shared/parse-eshop-csv.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface DaySpend {
  date: string;
  spend: number;
}

interface ChannelData {
  channel: string;
  spentThisMonth: number;
  dailyData: DaySpend[];
  sma7: number;
  prediction: number;
  target: number;
  pacing: "on_target" | "warn" | "off_target";
  deviationPct: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const clientSlug = parseClientSlug(body);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // --- Try to load from cache first ---
    let allRows: ParsedEshopRow[] = [];
    let lastSyncedAt: string | null = null;
    let usedCache = false;

    // Get config for webFilter / excludedCampaigns
    let config: Record<string, unknown> = {};
    try {
      const sources = await getClientSources(clientSlug, "eshop_costs");
      config = sources.config;
    } catch {
      return new Response(JSON.stringify({ channels: [], total: null, error: "no_source" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const budgetMode = (config?.budget_mode as string) || "total";
    const currency = (config?.currency as string) || "CZK";
    const webFilter = (config?.web_filter as string) || null;
    const excludedCampaignsRaw = (config?.excluded_campaigns as string) || "";
    const excludedCampaigns = excludedCampaignsRaw
      .split(",")
      .map((s: string) => s.trim().toLowerCase())
      .filter(Boolean);

    // We only need current month + 7 days before for SMA-7
    const now = new Date();
    const sma7Start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    const dateFrom = `${sma7Start.getFullYear()}-${String(sma7Start.getMonth() + 1).padStart(2, "0")}-${String(sma7Start.getDate()).padStart(2, "0")}`;

    // Check cache — filter by date range to avoid hitting row limits
    const { data: cachedRows, error: cacheError } = await supabaseAdmin
      .from("cached_eshop_costs")
      .select("date, channel, campaign_name, web, cost, synced_at")
      .eq("client_slug", clientSlug)
      .gte("date", `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`)
      .order("date", { ascending: true });

    // Also fetch last 7 days from previous month if needed (for SMA-7 at month start)
    let sma7Rows: typeof cachedRows = [];
    if (dateFrom < `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`) {
      const { data: prevRows } = await supabaseAdmin
        .from("cached_eshop_costs")
        .select("date, channel, campaign_name, web, cost, synced_at")
        .eq("client_slug", clientSlug)
        .gte("date", dateFrom)
        .lt("date", `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
      sma7Rows = prevRows || [];
    }

    const allCachedRows = [...(cachedRows || []), ...sma7Rows];

    if (!cacheError && allCachedRows.length > 0) {
      usedCache = true;
      lastSyncedAt = allCachedRows[0]?.synced_at || null;

      allRows = allCachedRows
        .filter(r => {
          if (webFilter && r.web !== webFilter) return false;
          if (excludedCampaigns.length > 0) {
            const cn = (r.campaign_name || "").toLowerCase();
            if (excludedCampaigns.some(exc => cn.includes(exc))) return false;
          }
          return true;
        })
        .map(r => ({
          web: r.web || "",
          date: r.date,
          channel: r.channel || "other",
          campaignName: r.campaign_name || "",
          cost: Number(r.cost) || 0,
        }));
    }

    // Fallback: fetch from Google Sheets if cache is empty
    if (!usedCache) {
      let urls: string[] = [];
      try {
        const sources = await getClientSources(clientSlug, "eshop_costs");
        urls = sources.urls;
      } catch {
        return new Response(JSON.stringify({ channels: [], total: null, error: "no_source" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (urls.length === 0) {
        return new Response(JSON.stringify({ channels: [], total: null, error: "no_urls" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      let response: Response;
      try {
        response = await fetch(urls[0], { signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) {
        return new Response(JSON.stringify({
          channels: [], total: null, error: "sheet_error",
          errorDetail: `Google Sheet vrátil chybu ${response.status}. Zkontrolujte, že je tabulka sdílená jako 'Kdokoli s odkazem'.`,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const csvText = await response.text();
      allRows = parseEshopCsv(csvText, { webFilter, excludedCampaigns });
    }

    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const today = now.getDate();
    const daysElapsed = today;
    const daysRemaining = daysInMonth - today;

    // Build daily spend per channel
    const channelDailyMap: Record<string, Record<string, number>> = {};
    for (const row of allRows) {
      const dateKey = row.date; // already YYYY-MM-DD
      if (!channelDailyMap[row.channel]) channelDailyMap[row.channel] = {};
      channelDailyMap[row.channel][dateKey] = (channelDailyMap[row.channel][dateKey] || 0) + row.cost;
    }

    // Get last 7 complete days
    const last7Days: string[] = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date(currentYear, currentMonth, today - i);
      last7Days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }

    // Current month days (1 to yesterday)
    const currentMonthDays: string[] = [];
    for (let i = 1; i < today; i++) {
      const d = new Date(currentYear, currentMonth, i);
      currentMonthDays.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }

    // Fetch budget targets
    let { data: targets } = await supabaseAdmin
      .from("eshop_budget_targets")
      .select("channel, target_amount")
      .eq("client_slug", clientSlug)
      .eq("month", currentMonth + 1)
      .eq("year", currentYear);

    if (!targets || targets.length === 0) {
      const { data: latestTargets } = await supabaseAdmin
        .from("eshop_budget_targets")
        .select("channel, target_amount, month, year")
        .eq("client_slug", clientSlug)
        .order("year", { ascending: false })
        .order("month", { ascending: false })
        .limit(20);

      if (latestTargets && latestTargets.length > 0) {
        const latestMonth = latestTargets[0].month;
        const latestYear = latestTargets[0].year;
        const fromPrevious = latestTargets.filter(
          (t) => t.month === latestMonth && t.year === latestYear
        );

        const newRows = fromPrevious.map((t) => ({
          client_slug: clientSlug,
          channel: t.channel,
          target_amount: t.target_amount,
          month: currentMonth + 1,
          year: currentYear,
        }));

        if (newRows.length > 0) {
          await supabaseAdmin.from("eshop_budget_targets").insert(newRows);
          targets = fromPrevious.map((t) => ({ channel: t.channel, target_amount: t.target_amount }));
        }
      }
    }

    const targetMap: Record<string, number> = {};
    for (const t of targets || []) {
      targetMap[t.channel] = Number(t.target_amount);
    }

    // Calculate per-channel data
    const channels: ChannelData[] = [];
    const allChannels = Object.keys(channelDailyMap).sort();

    for (const channel of allChannels) {
      const daily = channelDailyMap[channel];

      let spentThisMonth = 0;
      const dailyData: DaySpend[] = [];
      for (const dayKey of currentMonthDays) {
        const spend = daily[dayKey] || 0;
        spentThisMonth += spend;
        dailyData.push({ date: dayKey, spend });
      }

      let sum7 = 0;
      for (const dayKey of last7Days) {
        sum7 += daily[dayKey] || 0;
      }
      const sma7 = sum7 / 7;

      const target = targetMap[channel] || 0;

      const idealDaily = target > 0 ? target / daysInMonth : 0;
      let blendedRate: number;
      if (daysElapsed <= 10) {
        const wReal = daysElapsed / 10;
        const wIdeal = (10 - daysElapsed) / 10;
        blendedRate = sma7 * wReal + idealDaily * wIdeal;
      } else {
        blendedRate = sma7;
      }

      const prediction = spentThisMonth + blendedRate * daysRemaining;

      let pacing: "on_target" | "warn" | "off_target" = "on_target";
      let deviationPct = 0;
      if (target > 0) {
        deviationPct = ((prediction - target) / target) * 100;
        if (daysElapsed <= 10) {
          if (deviationPct > 10) pacing = "off_target";
          else if (deviationPct > 5) pacing = "warn";
          else if (deviationPct < -25) pacing = "off_target";
          else if (deviationPct < -10) pacing = "warn";
        } else {
          if (deviationPct > 3) pacing = "off_target";
          else if (deviationPct > 0) pacing = "warn";
          else if (deviationPct < -20) pacing = "off_target";
          else if (deviationPct < -10) pacing = "warn";
        }
      }

      channels.push({ channel, spentThisMonth, dailyData, sma7, prediction, target, pacing, deviationPct });
    }

    // Total
    let totalSpent = 0;
    let totalSma7 = 0;
    const totalDailyMap: Record<string, number> = {};

    for (const ch of channels) {
      totalSpent += ch.spentThisMonth;
      totalSma7 += ch.sma7;
      for (const d of ch.dailyData) {
        totalDailyMap[d.date] = (totalDailyMap[d.date] || 0) + d.spend;
      }
    }

    const totalTarget = targetMap["_total"] || channels.reduce((s, c) => s + c.target, 0);
    const totalIdealDaily = totalTarget > 0 ? totalTarget / daysInMonth : 0;
    let totalBlendedRate: number;
    if (daysElapsed <= 10) {
      const wReal = daysElapsed / 10;
      const wIdeal = (10 - daysElapsed) / 10;
      totalBlendedRate = totalSma7 * wReal + totalIdealDaily * wIdeal;
    } else {
      totalBlendedRate = totalSma7;
    }
    const totalPrediction = totalSpent + totalBlendedRate * daysRemaining;
    let totalPacing: "on_target" | "warn" | "off_target" = "on_target";
    let totalDeviationPct = 0;
    if (totalTarget > 0) {
      totalDeviationPct = ((totalPrediction - totalTarget) / totalTarget) * 100;
      if (daysElapsed <= 10) {
        if (totalDeviationPct > 10) totalPacing = "off_target";
        else if (totalDeviationPct > 5) totalPacing = "warn";
        else if (totalDeviationPct < -25) totalPacing = "off_target";
        else if (totalDeviationPct < -10) totalPacing = "warn";
      } else {
        if (totalDeviationPct > 3) totalPacing = "off_target";
        else if (totalDeviationPct > 0) totalPacing = "warn";
        else if (totalDeviationPct < -20) totalPacing = "off_target";
        else if (totalDeviationPct < -10) totalPacing = "warn";
      }
    }

    const totalDailyData = currentMonthDays.map((d) => ({ date: d, spend: totalDailyMap[d] || 0 }));

    // Determine adsActive
    const yesterdayKey = last7Days[0];
    const todayKey = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(today).padStart(2, "0")}`;
    let adsActive = false;
    for (const ch of Object.values(channelDailyMap)) {
      if ((ch[yesterdayKey] || 0) > 0 || (ch[todayKey] || 0) > 0) {
        adsActive = true;
        break;
      }
    }

    const result = {
      channels,
      total: {
        channel: "_total",
        spentThisMonth: totalSpent,
        dailyData: totalDailyData,
        sma7: totalSma7,
        prediction: totalPrediction,
        target: totalTarget,
        pacing: totalPacing,
        deviationPct: totalDeviationPct,
      },
      adsActive,
      budgetMode,
      currency,
      daysInMonth,
      daysElapsed,
      daysRemaining,
      currentMonth: currentMonth + 1,
      currentYear,
      lastSyncedAt,
      usedCache,
    };

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
