import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DateRange } from "react-day-picker";
import { Lead, CostRow, Granularity, MonthlyData } from "./useLeadGen";

export type MatchType = "campaign" | "adset" | "ad";

interface SourceComparisonConfig {
  sources: string[];
  campaigns: string[];
  adsets: string[];
  ads: string[];
  mappings: Record<string, string[]>;
  matchType: MatchType;
}

export interface SourceComparisonData {
  label: string;
  month: string;
  [key: string]: string | number | null;
}

const COMPARISON_COLORS = [
  "#4f11ff", "#b0f221", "#ff6b35", "#00b4d8", "#e63946", "#2a9d8f",
];

export function getComparisonColor(index: number): string {
  return COMPARISON_COLORS[index % COMPARISON_COLORS.length];
}

export function useSourceComparisonConfig(clientSlug: string) {
  return useQuery<SourceComparisonConfig>({
    queryKey: ["source-comparison-config", clientSlug],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-source-comparison", {
        body: { client_slug: clientSlug, action: "get" },
      });
      if (error) throw error;
      return data as SourceComparisonConfig;
    },
    staleTime: 1000 * 60 * 10,
    enabled: false,
  });
}

export function useSaveSourceComparisonConfig(clientSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ mappings, matchType }: { mappings: Record<string, string[]>; matchType: MatchType }) => {
      const { error } = await supabase.functions.invoke("manage-source-comparison", {
        body: { client_slug: clientSlug, action: "save", mappings, match_type: matchType },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["source-comparison-config", clientSlug] });
    },
  });
}

function getCostMatchValue(cost: CostRow, matchType: MatchType): string | undefined {
  if (matchType === "adset") return cost.adsetName;
  if (matchType === "ad") return cost.adName;
  return cost.campaignName;
}

export function buildComparisonData(
  leads: Lead[],
  costs: CostRow[],
  mappings: Record<string, string[]>,
  sources: string[],
  dateRange: DateRange | undefined,
  granularity: Granularity,
  matchType: MatchType = "campaign"
): SourceComparisonData[] {
  // Build reverse map: value -> sourceName
  const valueToSource = new Map<string, string>();
  for (const [sourceName, values] of Object.entries(mappings)) {
    for (const v of values) {
      valueToSource.set(v, sourceName);
    }
  }

  const parseLocalDate = (dateStr: string) => {
    if (dateStr.includes('T') || dateStr.includes('Z')) {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return null;
      return { date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
    }
    const parts = dateStr.split(/[-/T]/);
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const day = parseInt(parts[2]);
    const date = new Date(year, month, day);
    if (isNaN(date.getTime())) return null;
    return { year, month: month + 1, day, date };
  };

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

  const getKey = (dateStr: string): { key: string; label: string; days: number } | null => {
    const parsed = parseLocalDate(dateStr);
    if (!parsed) return null;
    if (granularity === "day") {
      return { key: `${parsed.year}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`, label: `${parsed.day}. ${parsed.month}.`, days: 1 };
    }
    if (granularity === "week" && dateRange?.from) {
      const startTime = new Date(dateRange.from.getFullYear(), dateRange.from.getMonth(), dateRange.from.getDate()).getTime();
      const dateTime = parsed.date.getTime();
      const daysSinceStart = Math.floor((dateTime - startTime) / (1000 * 60 * 60 * 24));
      const weekIndex = Math.floor(daysSinceStart / 7);
      const bucketStart = new Date(dateRange.from.getFullYear(), dateRange.from.getMonth(), dateRange.from.getDate() + weekIndex * 7);
      let bucketEnd = new Date(bucketStart); bucketEnd.setDate(bucketStart.getDate() + 6);
      if (dateRange.to) {
        const cap = new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), dateRange.to.getDate());
        if (bucketEnd > cap) bucketEnd = cap;
      }
      const days = Math.round((bucketEnd.getTime() - bucketStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const key = `${bucketStart.getFullYear()}-${String(bucketStart.getMonth() + 1).padStart(2, '0')}-${String(bucketStart.getDate()).padStart(2, '0')}`;
      const label = `${bucketStart.getDate()}.${bucketStart.getMonth() + 1}. – ${bucketEnd.getDate()}.${bucketEnd.getMonth() + 1}.`;
      return { key, label, days };
    }
    const key = `${parsed.year}-${String(parsed.month).padStart(2, '0')}`;
    const label = `${parsed.month}/${parsed.year}`;
    const daysInMonth = new Date(parsed.year, parsed.month, 0).getDate();
    const now = new Date();
    const isCurrentMonth = parsed.year === now.getFullYear() && parsed.month === (now.getMonth() + 1);
    const effectiveDays = isCurrentMonth ? Math.min(daysInMonth, now.getDate()) : daysInMonth;
    return { key, label, days: effectiveDays };
  };

  const bucketMap = new Map<string, SourceComparisonData>();

  const initBucket = (key: string, label: string) => {
    if (!bucketMap.has(key)) {
      const entry: SourceComparisonData = { label, month: key };
      for (const src of sources) {
        entry[`${src}_total`] = 0;
        entry[`${src}_qualified`] = 0;
        entry[`${src}_cost`] = 0;
        entry[`${src}_cpl`] = null;
      }
      bucketMap.set(key, entry);
    }
  };

  // Aggregate leads per source
  for (const lead of leads) {
    if (!inRange(lead.date)) continue;
    if (!lead.source || !sources.includes(lead.source)) continue;
    const kl = getKey(lead.date);
    if (!kl) continue;
    initBucket(kl.key, kl.label);
    const b = bucketMap.get(kl.key)!;
    b[`${lead.source}_total`] = ((b[`${lead.source}_total`] as number) || 0) + 1;
    if (lead.qualified) {
      b[`${lead.source}_qualified`] = ((b[`${lead.source}_qualified`] as number) || 0) + 1;
    }
  }

  // Aggregate costs per source (via mapping at the chosen level)
  for (const cost of costs) {
    if (!inRange(cost.date)) continue;
    const matchValue = getCostMatchValue(cost, matchType);
    const sourceName = matchValue ? valueToSource.get(matchValue) : undefined;
    if (!sourceName || !sources.includes(sourceName)) continue;
    const kl = getKey(cost.date);
    if (!kl) continue;
    initBucket(kl.key, kl.label);
    const b = bucketMap.get(kl.key)!;
    b[`${sourceName}_cost`] = ((b[`${sourceName}_cost`] as number) || 0) + cost.cost;
  }

  // Compute CPL
  for (const b of bucketMap.values()) {
    for (const src of sources) {
      const total = (b[`${src}_total`] as number) || 0;
      const cost = (b[`${src}_cost`] as number) || 0;
      b[`${src}_cpl`] = total > 0 ? cost / total : null;
    }
  }

  return Array.from(bucketMap.values()).sort((a, b) => a.month.localeCompare(b.month));
}
