import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { PageSpinner } from "@/components/ui/spinner";
import { ClientLogo } from "@/components/ClientLogo";
import { Users, TrendingUp, BarChart3, ShoppingCart, ChevronRight, Settings2, ArrowUpRight, AlertTriangle, CheckCircle2 } from "lucide-react";


function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} M Kč`;
  return `${Math.round(value).toLocaleString("cs-CZ")} Kč`;
}

function pacingColor(pacing: string) {
  if (pacing === "warn") return { bg: "bg-amber-500/10", text: "text-amber-600", dot: "bg-amber-500" };
  return { bg: "bg-red-500/10", text: "text-red-600", dot: "bg-red-500" };
}

interface HomeDashboardProps {
  slugs?: string[];
  onNavigateEcommerce: (slug: string) => void;
  onNavigateLeadgen: (slug: string) => void;
  onNavigateEcommerceSection: () => void;
  onNavigateLeadgenSection: () => void;
  userName: string;
}

export function HomeDashboard({ slugs, onNavigateEcommerce, onNavigateLeadgen, onNavigateEcommerceSection, onNavigateLeadgenSection, userName }: HomeDashboardProps) {
  const storageKey = `home_inactive_days_${userName}`;
  const [inactiveDays, setInactiveDays] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? parseInt(stored) || 7 : 7;
    } catch { return 7; }
  });

  const updateDays = (v: number) => {
    if (v > 0 && v <= 90) {
      setInactiveDays(v);
      localStorage.setItem(storageKey, String(v));
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["home-summary", slugs?.join(",") || "all", inactiveDays],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("fetch-home-summary", {
        body: { slugs: slugs || null, inactive_days: inactiveDays },
      });
      if (error) throw error;
      return data as {
        ecommerceAlerts: Array<{ slug: string; name: string; pacing: string; deviationPct: number; spent: number; target: number; currency: string }>;
        leadgenInactive: Array<{ slug: string; name: string; lastLeadDaysAgo: number | null }>;
        stats: { totalClients: number; totalSpend: number; totalLeads: number };
      };
    },
    staleTime: 5 * 60_000,
  });

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Dobré ráno";
    if (hour < 18) return "Dobré odpoledne";
    return "Dobrý večer";
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-foreground">{greeting()}, {userName}</h1>
            <p className="text-sm text-muted-foreground">Přehled vašeho portfolia</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{data?.stats.totalClients || 0}</p>
                    <p className="text-xs text-muted-foreground">Klientů celkem</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{formatCurrency(data?.stats.totalSpend || 0)}</p>
                    <p className="text-xs text-muted-foreground">Investice tento měsíc</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <BarChart3 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{data?.stats.totalLeads || 0}</p>
                    <p className="text-xs text-muted-foreground">Poptávek tento měsíc</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Ecommerce alerts widget */}
            <Card className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                      <ShoppingCart className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <CardTitle className="text-sm font-semibold">Ecommerce – stav rozpočtu</CardTitle>
                  </div>
                  <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground h-7 px-2" onClick={onNavigateEcommerceSection}>
                    Vše <ArrowUpRight className="h-3 w-3" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                {(!data?.ecommerceAlerts || data.ecommerceAlerts.length === 0) ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500/60" />
                    <p className="text-sm text-muted-foreground">Všichni klienti jsou on target</p>
                  </div>
                ) : (
                  <div className="space-y-1 max-h-[360px] overflow-y-auto">
                    {data.ecommerceAlerts.map((client) => {
                      const c = pacingColor(client.pacing);
                      const absD = Math.abs(client.deviationPct);
                      return (
                        <button
                          key={client.slug}
                          onClick={() => onNavigateEcommerce(client.slug)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-muted/50 transition-colors text-left group"
                        >
                          <ClientLogo slug={client.slug} name={client.name} className="h-7 w-7 object-contain shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{client.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {Math.round(client.spent).toLocaleString("cs-CZ")} / {Math.round(client.target).toLocaleString("cs-CZ")} {client.currency === "EUR" ? "€" : "Kč"}
                            </p>
                          </div>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
                            {client.deviationPct > 0 ? "+" : "−"}{absD.toFixed(0)}%
                          </span>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Leadgen inactive widget */}
            <Card className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                      <BarChart3 className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <CardTitle className="text-sm font-semibold">LeadGen – stav poptávek</CardTitle>
                  </div>
                  <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground h-7 px-2" onClick={onNavigateLeadgenSection}>
                    Vše <ArrowUpRight className="h-3 w-3" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 mt-2 pl-9">
                  <span className="text-xs text-muted-foreground">Neaktivní déle než</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-6 px-2 text-xs gap-1 font-medium">
                        {inactiveDays} dní
                        <Settings2 className="h-3 w-3" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-48" align="start">
                      <div className="space-y-2">
                        <Label className="text-xs">Počet dní bez poptávky</Label>
                        <Input
                          type="number"
                          min={1}
                          max={90}
                          value={inactiveDays}
                          onChange={(e) => updateDays(parseInt(e.target.value))}
                          className="h-8 text-sm"
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                {(!data?.leadgenInactive || data.leadgenInactive.length === 0) ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500/60" />
                    <p className="text-sm text-muted-foreground">Všichni klienti mají čerstvé poptávky</p>
                  </div>
                ) : (
                  <div className="space-y-1 max-h-[360px] overflow-y-auto">
                    {data.leadgenInactive.map((client) => (
                      <button
                        key={client.slug}
                        onClick={() => onNavigateLeadgen(client.slug)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-muted/50 transition-colors text-left group"
                      >
                        <ClientLogo slug={client.slug} name={client.name} className="h-7 w-7 object-contain shrink-0" />
                        <p className="text-sm font-medium truncate flex-1 min-w-0">{client.name}</p>
                        <Badge variant="outline" className="text-[11px] shrink-0">
                          {client.lastLeadDaysAgo === null ? "žádná" : `${client.lastLeadDaysAgo} dní`}
                        </Badge>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
