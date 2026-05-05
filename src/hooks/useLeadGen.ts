import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";
import { DateRange } from "react-day-picker";

export interface Lead {
  date: string;
  qualified: boolean;
  source?: string;
}

export interface CostRow {
  date: string;
  cost: number;
  clicks: number;
  impressions: number;
  campaignName?: string;
  adsetName?: string;
  adName?: string;
}

export type Granularity = "day" | "week" | "month" | "year";

export interface MonthlyData {
  month: string;
  label: string;
  totalLeads: number;
  qualifiedLeads: number;
  adCost: number;
  qualifiedPct: number;
  // For weekly/monthly: raw totals + daily averages
  days: number;
  avgTotalLeads: number;
  avgQualifiedLeads: number;
  avgUnqualifiedLeads: number;
  avgAdCost: number;
  avgCpl: number;
  avgCplQualified: number;
}

export interface PeriodComparison {
  totalLeads: number;
  totalQualified: number;
  totalAdCost: number;
  cpl: number;
  cplQualified: number;
  qualifiedPct: number;
  // Change percentages (null = no previous data)
  totalLeadsChange: number | null;
  totalQualifiedChange: number | null;
  totalAdCostChange: number | null;
  cplChange: number | null;
  cplQualifiedChange: number | null;
  qualifiedPctChange: number | null;
  changeLabel: string;
}

function getGranularity(dateRange?: DateRange): Granularity {
  if (!dateRange?.from || !dateRange?.to) return "month";
  const diffDays = Math.round((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 14) return "day";
  if (diffDays <= 31) return "week";
  if (diffDays <= 93) return "week";
  return "month";
}

function getTableGranularity(dateRange?: DateRange): Granularity {
  if (!dateRange?.from || !dateRange?.to) return "month";
  const diffDays = Math.round((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 31) return "day";
  if (diffDays <= 365) return "month";
  return "year";
}

function getWeekKey(date: Date, periodStart: Date, periodEnd?: Date): { key: string; label: string; days: number } {
  const startTime = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate()).getTime();
  const dateTime = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const daysSinceStart = Math.floor((dateTime - startTime) / (1000 * 60 * 60 * 24));
  const weekIndex = Math.floor(daysSinceStart / 7);
  
  const bucketStart = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate() + weekIndex * 7);
  let bucketEnd = new Date(bucketStart);
  bucketEnd.setDate(bucketStart.getDate() + 6);
  
  // Cap at period end (e.g. end of month)
  if (periodEnd) {
    const capDate = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate());
    if (bucketEnd > capDate) bucketEnd = capDate;
  }
  
  const days = Math.round((bucketEnd.getTime() - bucketStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const key = `${bucketStart.getFullYear()}-${String(bucketStart.getMonth() + 1).padStart(2, '0')}-${String(bucketStart.getDate()).padStart(2, '0')}`;
  const label = `${bucketStart.getDate()}.${bucketStart.getMonth() + 1}. – ${bucketEnd.getDate()}.${bucketEnd.getMonth() + 1}.`;
  return { key, label, days };
}

function parseLocalDate(dateStr: string): { year: number; month: number; day: number; date: Date } | null {
  // If the string contains 'T' or 'Z', it's an ISO timestamp — parse via Date
  // to correctly convert UTC to local timezone
  if (dateStr.includes('T') || dateStr.includes('Z')) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), date: new Date(d.getFullYear(), d.getMonth(), d.getDate()) };
  }
  // Otherwise treat as local date string (e.g. "2026-03-02" or "2026-03-02 10:00:00")
  const parts = dateStr.split(/[-/T]/);
  const year = parseInt(parts[0]);
  const month = parseInt(parts[1]) - 1;
  const day = parseInt(parts[2]);
  const date = new Date(year, month, day);
  if (isNaN(date.getTime())) return null;
  return { year, month: month + 1, day, date };
}

function aggregateData(leads: Lead[], costs: CostRow[], dateRange?: DateRange, forceGranularity?: Granularity): { data: MonthlyData[]; granularity: Granularity } {
  const granularity = forceGranularity || getGranularity(dateRange);
  const map = new Map<string, MonthlyData>();

  const inRange = (dateStr: string) => {
    if (!dateRange?.from) return true;
    const parsed = parseLocalDate(dateStr);
    if (!parsed) return false;
    const fromDate = new Date(dateRange.from.getFullYear(), dateRange.from.getMonth(), dateRange.from.getDate());
    if (parsed.date < fromDate) return false;
    if (dateRange.to) {
      const toDate = new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), dateRange.to.getDate());
      if (parsed.date > toDate) return false;
    }
    return true;
  };

  const getKey = (dateStr: string): { key: string; label: string; days?: number } | null => {
    const parsed = parseLocalDate(dateStr);
    if (!parsed) return null;
    if (granularity === "day") {
      const key = `${parsed.year}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`;
      const label = `${parsed.day}. ${parsed.month}.`;
      return { key, label, days: 1 };
    }
    if (granularity === "week" && dateRange?.from) {
      return getWeekKey(parsed.date, dateRange.from, dateRange.to);
    }
    if (granularity === "year") {
      const key = `${parsed.year}`;
      const label = `${parsed.year}`;
      return { key, label, days: 365 };
    }
    const key = `${parsed.year}-${String(parsed.month).padStart(2, '0')}`;
    const label = `${parsed.month}/${parsed.year}`;
    const daysInMonth = new Date(parsed.year, parsed.month, 0).getDate();
    const now = new Date();
    const isCurrentMonth = parsed.year === now.getFullYear() && parsed.month === (now.getMonth() + 1);
    const effectiveDays = isCurrentMonth ? Math.min(daysInMonth, now.getDate()) : daysInMonth;
    return { key, label, days: effectiveDays };
  };

  const initBucket = (key: string, label: string, days: number) => {
    if (!map.has(key)) {
      map.set(key, {
        month: key, label, days,
        totalLeads: 0, qualifiedLeads: 0, adCost: 0, qualifiedPct: 0,
        avgTotalLeads: 0, avgQualifiedLeads: 0, avgUnqualifiedLeads: 0, avgAdCost: 0, avgCpl: 0, avgCplQualified: 0,
      });
    }
  };

  for (const lead of leads) {
    if (!inRange(lead.date)) continue;
    const kl = getKey(lead.date);
    if (!kl) continue;
    initBucket(kl.key, kl.label, kl.days || 1);
    const m = map.get(kl.key)!;
    m.totalLeads += 1;
    if (lead.qualified) m.qualifiedLeads += 1;
  }

  for (const c of costs) {
    if (!inRange(c.date)) continue;
    const kl = getKey(c.date);
    if (!kl) continue;
    initBucket(kl.key, kl.label, kl.days || 1);
    map.get(kl.key)!.adCost += c.cost;
  }

  for (const m of map.values()) {
    m.qualifiedPct = m.totalLeads > 0 ? (m.qualifiedLeads / m.totalLeads) * 100 : 0;
    const d = m.days || 1;
    m.avgTotalLeads = m.totalLeads / d;
    m.avgQualifiedLeads = m.qualifiedLeads / d;
    m.avgUnqualifiedLeads = (m.totalLeads - m.qualifiedLeads) / d;
    m.avgAdCost = m.adCost / d;
    m.avgCpl = m.totalLeads > 0 ? m.adCost / m.totalLeads : 0;
    m.avgCplQualified = m.qualifiedLeads > 0 ? m.adCost / m.qualifiedLeads : 0;
  }

  // Fill in missing buckets for continuous X axis
  if (granularity === "month" && dateRange?.from && dateRange?.to) {
    const cursor = new Date(dateRange.from.getFullYear(), dateRange.from.getMonth(), 1);
    const end = new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), 1);
    const now = new Date();
    while (cursor <= end) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth() + 1;
      const key = `${y}-${String(m).padStart(2, '0')}`;
      if (!map.has(key)) {
        const label = `${m}/${y}`;
        const daysInMonth = new Date(y, m, 0).getDate();
        const isCurrentMonth = y === now.getFullYear() && m === (now.getMonth() + 1);
        const effectiveDays = isCurrentMonth ? Math.min(daysInMonth, now.getDate()) : daysInMonth;
        initBucket(key, label, effectiveDays);
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  return {
    data: Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month)),
    granularity,
  };
}

function getPreviousRange(dateRange: DateRange | undefined): { range: DateRange; label: string } | null {
  if (!dateRange?.from || !dateRange?.to) return null;

  const from = dateRange.from;
  const to = dateRange.to;
  const durationMs = to.getTime() - from.getTime();
  const durationDays = Math.round(durationMs / (1000 * 60 * 60 * 24));

  const prevTo = new Date(from);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setTime(prevTo.getTime() - durationMs);

  let label: string;
  if (durationDays <= 1) {
    label = "předchozí den";
  } else if (durationDays <= 7) {
    label = "předchozí týden";
  } else if (durationDays <= 31) {
    label = "předchozí měsíc";
  } else if (durationDays <= 93) {
    label = "předchozí 3 měs.";
  } else if (durationDays <= 186) {
    label = "předchozí 6 měs.";
  } else if (durationDays <= 366) {
    label = "předchozí rok";
  } else {
    label = "předchozí období";
  }

  return { range: { from: prevFrom, to: prevTo }, label };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0 && current === 0) return 0;
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function useLeads(clientSlug: string) {
  return useQuery({
    queryKey: ["leads", clientSlug],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("fetch-leads", {
        body: { client_slug: clientSlug },
      });
      if (error) throw error;
      return data as Lead[];
    },
    staleTime: 1000 * 60 * 5,
    enabled: !!clientSlug,
  });
}

export function useMarketingCosts(clientSlug: string) {
  return useQuery({
    queryKey: ["marketing-costs", clientSlug],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("fetch-marketing-costs", {
        body: { client_slug: clientSlug },
      });
      if (error) throw error;
      return data as CostRow[];
    },
    staleTime: 1000 * 60 * 5,
    enabled: !!clientSlug,
  });
}

export function useLeadGenData(dateRange: DateRange | undefined, clientSlug: string) {
  const leadsQuery = useLeads(clientSlug);
  const costsQuery = useMarketingCosts(clientSlug);

  const isLoading = leadsQuery.isLoading || costsQuery.isLoading;
  const error = leadsQuery.error || costsQuery.error;

  const { data: monthly, granularity } = useMemo(() => {
    if (!leadsQuery.data) return { data: [], granularity: "month" as Granularity };
    return aggregateData(leadsQuery.data, costsQuery.data || [], dateRange);
  }, [leadsQuery.data, costsQuery.data, dateRange]);

  const { data: tableData, granularity: tableGranularity } = useMemo(() => {
    if (!leadsQuery.data) return { data: [], granularity: "day" as Granularity };
    const tg = getTableGranularity(dateRange);
    return aggregateData(leadsQuery.data, costsQuery.data || [], dateRange, tg);
  }, [leadsQuery.data, costsQuery.data, dateRange]);

  const totalLeads = monthly.reduce((s, m) => s + m.totalLeads, 0);
  const totalQualified = monthly.reduce((s, m) => s + m.qualifiedLeads, 0);
  const totalAdCost = monthly.reduce((s, m) => s + m.adCost, 0);
  const cpl = totalLeads > 0 ? totalAdCost / totalLeads : 0;
  const cplQualified = totalQualified > 0 ? totalAdCost / totalQualified : 0;
  const qualifiedPct = totalLeads > 0 ? (totalQualified / totalLeads) * 100 : 0;

  // Previous period comparison
  const comparison = useMemo((): PeriodComparison => {
    const prev = getPreviousRange(dateRange);
    let changeLabel = "";
    let prevLeads = 0, prevQualified = 0, prevAdCost = 0;

    if (prev && leadsQuery.data) {
      changeLabel = prev.label;
      const { data: prevMonthly } = aggregateData(leadsQuery.data, costsQuery.data || [], prev.range);
      prevLeads = prevMonthly.reduce((s, m) => s + m.totalLeads, 0);
      prevQualified = prevMonthly.reduce((s, m) => s + m.qualifiedLeads, 0);
      prevAdCost = prevMonthly.reduce((s, m) => s + m.adCost, 0);
    }

    const prevCpl = prevLeads > 0 ? prevAdCost / prevLeads : 0;
    const prevCplQ = prevQualified > 0 ? prevAdCost / prevQualified : 0;
    const prevQPct = prevLeads > 0 ? (prevQualified / prevLeads) * 100 : 0;

    return {
      totalLeads,
      totalQualified,
      totalAdCost,
      cpl,
      cplQualified,
      qualifiedPct,
      totalLeadsChange: prev ? pctChange(totalLeads, prevLeads) : null,
      totalQualifiedChange: prev ? pctChange(totalQualified, prevQualified) : null,
      totalAdCostChange: prev ? pctChange(totalAdCost, prevAdCost) : null,
      cplChange: prev ? pctChange(cpl, prevCpl) : null,
      cplQualifiedChange: prev ? pctChange(cplQualified, prevCplQ) : null,
      qualifiedPctChange: prev ? pctChange(qualifiedPct, prevQPct) : null,
      changeLabel,
    };
  }, [leadsQuery.data, costsQuery.data, dateRange, totalLeads, totalQualified, totalAdCost, cpl, cplQualified, qualifiedPct]);

  return {
    isLoading,
    error,
    monthly,
    granularity,
    tableData,
    tableGranularity,
    totalLeads,
    totalQualified,
    totalAdCost,
    cpl,
    cplQualified,
    qualifiedPct,
    comparison,
    rawLeads: leadsQuery.data || [],
    rawCosts: costsQuery.data || [],
  };
}
