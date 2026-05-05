import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";
import { DateRange } from "react-day-picker";

export interface Order {
  date: string;
  totalPriceWithoutVat: number;
  totalPriceWithVat: number;
  totalPriceVat: number;
  orderPurchasePrice: number;
}

export interface AdCostRow {
  web: string;
  date: string;
  source: string;
  medium: string;
  cost: number;
  clicks: number;
  impressions: number;
  campaignName: string;
  campaignId: string;
  conversions: number;
  conversionsValue: number;
}

export interface MonthlyData {
  month: string;
  label: string;
  revenue: number;
  revenueWithoutVat: number;
  vat: number;
  purchasePrice: number;
  margin: number;
  orderCount: number;
  adCost: number;
  adClicks: number;
  adImpressions: number;
  adConversions: number;
  adConversionsValue: number;
  profitAfterAds: number;
}

function aggregateByMonth(orders: Order[], adCosts: AdCostRow[], dateRange?: DateRange): MonthlyData[] {
  const map = new Map<string, MonthlyData>();

  const inRange = (dateStr: string) => {
    if (!dateRange?.from) return true;
    const d = new Date(dateStr);
    if (d < dateRange.from) return false;
    if (dateRange.to) {
      const endOfDay = new Date(dateRange.to);
      endOfDay.setHours(23, 59, 59, 999);
      if (d > endOfDay) return false;
    }
    return true;
  };

  const initMonth = (key: string, label: string) => {
    if (!map.has(key)) {
      map.set(key, {
        month: key, label,
        revenue: 0, revenueWithoutVat: 0, vat: 0, purchasePrice: 0,
        margin: 0, orderCount: 0,
        adCost: 0, adClicks: 0, adImpressions: 0, adConversions: 0,
        adConversionsValue: 0, profitAfterAds: 0,
      });
    }
  };

  for (const order of orders) {
    if (!inRange(order.date)) continue;
    const d = new Date(order.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${d.getMonth() + 1}/${d.getFullYear()}`;
    initMonth(key, label);

    const m = map.get(key)!;
    m.revenue += order.totalPriceWithVat;
    m.revenueWithoutVat += order.totalPriceWithoutVat;
    m.vat += order.totalPriceVat;
    m.purchasePrice += order.orderPurchasePrice;
    m.margin += order.totalPriceWithoutVat - order.orderPurchasePrice;
    m.orderCount += 1;
  }

  for (const ad of adCosts) {
    if (!inRange(ad.date)) continue;
    const d = new Date(ad.date);
    if (isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${d.getMonth() + 1}/${d.getFullYear()}`;
    initMonth(key, label);

    const m = map.get(key)!;
    m.adCost += ad.cost;
    m.adClicks += ad.clicks;
    m.adImpressions += ad.impressions;
    m.adConversions += ad.conversions;
    m.adConversionsValue += ad.conversionsValue;
  }

  for (const m of map.values()) {
    m.profitAfterAds = m.margin - m.adCost;
  }

  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

export function useOrders(clientSlug: string) {
  return useQuery({
    queryKey: ["orders", clientSlug],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("fetch-orders", {
        body: { client_slug: clientSlug },
      });
      if (error) throw error;
      return data as Order[];
    },
    staleTime: 1000 * 60 * 60,
    enabled: !!clientSlug,
  });
}

export function useAdCosts(clientSlug: string) {
  return useQuery({
    queryKey: ["ad-costs", clientSlug],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("fetch-ad-costs", {
        body: { client_slug: clientSlug },
      });
      if (error) throw error;
      return data as AdCostRow[];
    },
    staleTime: 1000 * 60 * 60,
    enabled: !!clientSlug,
  });
}

export function useDashboardData(dateRange: DateRange | undefined, clientSlug: string) {
  const ordersQuery = useOrders(clientSlug);
  const adCostsQuery = useAdCosts(clientSlug);

  const isLoading = ordersQuery.isLoading || adCostsQuery.isLoading;
  const error = ordersQuery.error || adCostsQuery.error;

  const monthly = useMemo(() => {
    if (!ordersQuery.data) return [];
    return aggregateByMonth(ordersQuery.data, adCostsQuery.data || [], dateRange);
  }, [ordersQuery.data, adCostsQuery.data, dateRange]);

  return {
    isLoading,
    error,
    monthly,
    totalRevenue: monthly.reduce((s, m) => s + m.revenue, 0),
    totalRevenueWithoutVat: monthly.reduce((s, m) => s + m.revenueWithoutVat, 0),
    totalOrders: monthly.reduce((s, m) => s + m.orderCount, 0),
    totalMargin: monthly.reduce((s, m) => s + m.margin, 0),
    totalAdCost: monthly.reduce((s, m) => s + m.adCost, 0),
    totalProfitAfterAds: monthly.reduce((s, m) => s + m.profitAfterAds, 0),
    totalAdConversions: monthly.reduce((s, m) => s + m.adConversions, 0),
  };
}
