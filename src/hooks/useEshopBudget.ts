import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DaySpend {
  date: string;
  spend: number;
}

export interface ChannelData {
  channel: string;
  spentThisMonth: number;
  dailyData: DaySpend[];
  sma7: number;
  prediction: number;
  target: number;
  pacing: "on_target" | "warn" | "off_target";
  deviationPct: number;
}

export interface EshopBudgetData {
  channels: ChannelData[];
  total: ChannelData | null;
  budgetMode: string;
  currency: string;
  daysInMonth: number;
  daysElapsed: number;
  daysRemaining: number;
  currentMonth: number;
  currentYear: number;
  error?: string;
  lastSyncedAt?: string | null;
  usedCache?: boolean;
}

export function useEshopBudget(clientSlug: string | null) {
  return useQuery<EshopBudgetData>({
    queryKey: ["eshop-budget", clientSlug],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("fetch-eshop-budget", {
        body: { client_slug: clientSlug },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!clientSlug,
    staleTime: 5 * 60_000,
  });
}

export interface EshopConfig {
  client: { id: string; slug: string; name: string; display_name: string | null };
  source: {
    id: string;
    source_urls: string[];
    config: Record<string, unknown>;
  } | null;
  targets: Array<{ id: string; channel: string; target_amount: number; month: number; year: number }>;
}

export function useEshopConfig(clientSlug: string | null) {
  return useQuery<EshopConfig>({
    queryKey: ["eshop-config", clientSlug],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-eshop-config", {
        body: { action: "get", client_slug: clientSlug },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!clientSlug,
  });
}
