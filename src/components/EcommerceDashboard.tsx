import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEshopBudget, ChannelData } from "@/hooks/useEshopBudget";
import { EcommerceSettings } from "@/components/EcommerceSettings";
import { CreateClientWizard } from "@/components/CreateClientWizard";
import { NotificationSettingsDialog } from "@/components/NotificationSettingsDialog";

import { PageSpinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ClientLogo } from "@/components/ClientLogo";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronDown, ChevronRight, Settings2, Plus, UserPlus, Settings, Circle, Clock } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";

import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

// --- Helpers ---

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} M`;
  return Math.round(value).toLocaleString("cs-CZ");
}

function formatCurrencyFull(value: number): string {
  return Math.round(value).toLocaleString("cs-CZ");
}

function currencySymbol(currency?: string): string {
  return currency === "EUR" ? "€" : "Kč";
}

function pacingColor(pacing: string): { bg: string; text: string; ring: string; dot: string } {
  if (pacing === "on_target") return { bg: "bg-emerald-500/10", text: "text-emerald-600", ring: "ring-emerald-500/20", dot: "bg-emerald-500" };
  if (pacing === "warn") return { bg: "bg-amber-500/10", text: "text-amber-600", ring: "ring-amber-500/20", dot: "bg-amber-500" };
  return { bg: "bg-red-500/10", text: "text-red-600", ring: "ring-red-500/20", dot: "bg-red-500" };
}

function pacingLabel(pacing: string): string {
  if (pacing === "on_target") return "On Target";
  if (pacing === "warn") return "Varování";
  return "Off Target";
}

function pacingBadge(pacing: string, deviation: number) {
  const c = pacingColor(pacing);
  const absD = Math.abs(deviation);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ${c.bg} ${c.text} ${c.ring}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {pacing === "on_target" ? "On Target" : `${deviation > 0 ? "+" : "−"}${absD.toFixed(0)}%`}
    </span>
  );
}

function channelLabel(channel: string): string {
  const map: Record<string, string> = {
    google: "Google Ads",
    meta: "Meta Ads",
    sklik: "Sklik",
    bing: "Bing Ads",
    _total: "Celkem",
  };
  return map[channel] || channel.charAt(0).toUpperCase() + channel.slice(1);
}

function formatRelativeTime(dateStr: string) {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "právě teď";
    if (diffMin < 60) return `před ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `před ${diffH} h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD === 1) return "včera";
    return `před ${diffD} dny`;
  } catch {
    return dateStr;
  }
}

// --- Burn Rate Chart ---

function BurnRateChart({ data, daysInMonth, target, cs = "Kč" }: { data: ChannelData; daysInMonth: number; target: number; cs?: string }) {
  const chartData: Array<{ day: number; actual?: number; ideal?: number; predicted?: number }> = [];

  let cumActual = 0;
  for (let i = 0; i < data.dailyData.length; i++) {
    cumActual += data.dailyData[i].spend;
    chartData.push({
      day: i + 1,
      actual: cumActual,
      ideal: target > 0 ? (target / daysInMonth) * (i + 1) : undefined,
    });
  }

  const lastActualDay = data.dailyData.length;
  let cumPredicted = cumActual;
  for (let i = lastActualDay + 1; i <= daysInMonth; i++) {
    cumPredicted += data.sma7;
    chartData.push({
      day: i,
      predicted: cumPredicted,
      ideal: target > 0 ? (target / daysInMonth) * i : undefined,
    });
  }

  if (lastActualDay > 0 && lastActualDay < daysInMonth) {
    const connIdx = chartData.findIndex((d) => d.day === lastActualDay);
    if (connIdx >= 0) chartData[connIdx].predicted = cumActual;
  }

  const c = pacingColor(data.pacing);

  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 10, right: 16, bottom: 5, left: 0 }}>
          <defs>
            <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={0.12} />
              <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0.01} />
            </linearGradient>
            <linearGradient id="predictedGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.1} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => formatCurrency(v)}
            width={50}
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              `${formatCurrencyFull(value)} ${cs}`,
              name === "actual" ? "Reálná útrata" : name === "ideal" ? "Ideální tempo" : "Predikce (SMA-7)",
            ]}
            labelFormatter={(day) => `Den ${day}`}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid hsl(var(--border))",
              boxShadow: "0 4px 12px -2px hsl(var(--foreground) / 0.08)",
              backgroundColor: "hsl(var(--popover))",
              color: "hsl(var(--popover-foreground))",
            }}
          />
          {target > 0 && (
            <Line
              type="monotone"
              dataKey="ideal"
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="6 4"
              strokeWidth={1}
              dot={false}
              opacity={0.4}
            />
          )}
          <Area
            type="monotone"
            dataKey="actual"
            stroke="none"
            fill="url(#actualGradient)"
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke="hsl(var(--foreground))"
            strokeWidth={2.5}
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="predicted"
            stroke="none"
            fill="url(#predictedGradient)"
          />
          <Line
            type="monotone"
            dataKey="predicted"
            stroke="hsl(var(--primary))"
            strokeDasharray="6 3"
            strokeWidth={2}
            dot={false}
          />
          {target > 0 && (
            <ReferenceLine
              y={target}
              stroke="hsl(var(--destructive))"
              strokeDasharray="8 4"
              opacity={0.5}
              label={{
                value: `Cíl: ${formatCurrency(target)} ${cs}`,
                position: "insideTopRight",
                fill: "hsl(var(--destructive))",
                fontSize: 10,
                fontWeight: 600,
              }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Progress ring ---

function ProgressRing({ percentage, pacing }: { percentage: number; pacing: string }) {
  const capped = Math.min(percentage, 100);
  const c = pacingColor(pacing);
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (capped / 100) * circumference;

  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth="4" />
        <circle
          cx="32" cy="32" r={radius} fill="none"
          stroke={pacing === "on_target" ? "#10b981" : pacing === "warn" ? "#f59e0b" : "#ef4444"}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-xs font-bold ${c.text}`}>{Math.round(capped)}%</span>
      </div>
    </div>
  );
}

// --- Client Detail ---

function EcommerceClientDetail({ clientSlug, clientName }: { clientSlug: string; clientName: string }) {
  const { data, isLoading } = useEshopBudget(clientSlug);
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);
  const cs = data?.currency ? currencySymbol(data.currency) : "Kč";

  if (isLoading) return <PageSpinner label="Načítám data…" />;
  if (!data || data.error) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          {data?.error === "no_source" ? "E-shop rozpočet není nakonfigurován." : "Chyba při načítání dat."}
        </p>
        <EcommerceSettings clientSlug={clientSlug} />
      </div>
    );
  }

  const items = data.budgetMode === "per_channel" ? data.channels : [];
  const showTotal = data.total;

  return (
    <div className="space-y-6">
      {/* Total summary */}
      {showTotal && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {/* Header with progress ring */}
          <div className="p-5 sm:p-6 pb-0">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <ProgressRing
                  percentage={showTotal.target > 0 ? (showTotal.spentThisMonth / showTotal.target) * 100 : 0}
                  pacing={showTotal.pacing}
                />
                <div>
                  <h3 className="text-base font-semibold text-foreground font-[var(--font-heading)]">Celkový přehled</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Den {data.daysElapsed} z {data.daysInMonth} · Zbývá {data.daysRemaining} dní
                    {data.lastSyncedAt && (
                      <span className="ml-2 opacity-60">· Data z {formatRelativeTime(data.lastSyncedAt)}</span>
                    )}
                  </p>
                </div>
              </div>
              {pacingBadge(showTotal.pacing, showTotal.deviationPct)}
            </div>

            {/* Metric cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
              {[
                { label: "Cíl", value: showTotal.target > 0 ? `${formatCurrency(showTotal.target)} ${cs}` : "—", muted: true },
                { label: "Utraceno", value: `${formatCurrency(showTotal.spentThisMonth)} ${cs}` },
                { label: "Denní tempo", value: `${formatCurrency(showTotal.sma7)} ${cs}`, sub: "SMA-7" },
                { label: "Predikce", value: `${formatCurrency(showTotal.prediction)} ${cs}`, highlight: true },
              ].map((m) => (
                <div
                  key={m.label}
                  className={`rounded-xl p-3 ${m.highlight ? "bg-primary/5 ring-1 ring-primary/10" : "bg-muted/30"}`}
                >
                  <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                    {m.label} {m.sub && <span className="normal-case tracking-normal opacity-60">({m.sub})</span>}
                  </p>
                  <p className={`text-lg font-bold mt-1 ${m.muted ? "text-muted-foreground" : "text-foreground"}`}>
                    {m.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            {showTotal.target > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5">
                  <span>{Math.round((showTotal.spentThisMonth / showTotal.target) * 100)}% utraceno</span>
                  <span>{formatCurrency(showTotal.target - showTotal.spentThisMonth)} {cs} zbývá</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-out ${
                      showTotal.pacing === "on_target" ? "bg-emerald-500" :
                      showTotal.pacing === "warn" ? "bg-amber-500" : "bg-red-500"
                    }`}
                    style={{ width: `${Math.min((showTotal.spentThisMonth / showTotal.target) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Chart */}
          <div className="px-2 sm:px-4 pt-4 pb-2">
            <BurnRateChart data={showTotal} daysInMonth={data.daysInMonth} target={showTotal.target} cs={cs} />
          </div>

          {/* Legend */}
          <div className="flex items-center gap-5 px-5 pb-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 bg-foreground rounded" /> Reálná útrata
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 bg-primary rounded border-dashed" style={{ borderTop: "2px dashed hsl(var(--primary))", height: 0 }} /> Predikce
            </span>
            {showTotal.target > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded" style={{ borderTop: "2px dashed hsl(var(--muted-foreground))", height: 0, opacity: 0.4 }} /> Ideální tempo
              </span>
            )}
          </div>
        </div>
      )}

      {/* Per-channel breakdown */}
      {items.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-3 px-4 border-b border-border bg-muted/30">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Kanály</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent bg-muted/40">
                <TableHead className="w-8"></TableHead>
                <TableHead>Kanál</TableHead>
                <TableHead className="text-right">Cíl</TableHead>
                <TableHead className="text-right">Utraceno</TableHead>
                <TableHead className="text-right">Predikce</TableHead>
                <TableHead className="text-center">Stav</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((ch) => (
                <Collapsible key={ch.channel} asChild>
                  <>
                    <CollapsibleTrigger asChild>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/20"
                        onClick={() => setExpandedChannel(expandedChannel === ch.channel ? null : ch.channel)}
                      >
                        <TableCell className="py-3">
                          {expandedChannel === ch.channel ? (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{channelLabel(ch.channel)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {ch.target > 0 ? `${formatCurrency(ch.target)} ${cs}` : "—"}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(ch.spentThisMonth)} {cs}</TableCell>
                        <TableCell className="text-right">{formatCurrency(ch.prediction)} {cs}</TableCell>
                        <TableCell className="text-center">{pacingBadge(ch.pacing, ch.deviationPct)}</TableCell>
                      </TableRow>
                    </CollapsibleTrigger>
                    {expandedChannel === ch.channel && (
                      <TableRow>
                        <TableCell colSpan={6} className="p-4 bg-muted/10">
                          <BurnRateChart data={ch} daysInMonth={data.daysInMonth} target={ch.target} cs={cs} />
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                </Collapsible>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// --- Overview types ---

type EshopConfiguredClient = {
  slug: string;
  name: string;
  pacing: string;
  deviationPct: number;
  spent: number;
  target: number;
  prediction: number;
  adsActive: boolean;
  accountManagers?: string[];
  currency?: string;
};

// --- Ecommerce Client Table (reusable for grouped display) ---

function EcommerceClientTable({
  clients,
  title,
  onSelectClient,
  userType,
  userId,
  userDisplayName,
  dimmed = false,
  amActivity,
}: {
  clients: EshopConfiguredClient[];
  title: string;
  onSelectClient: (slug: string) => void;
  userType?: "admin" | "am";
  userId?: string;
  userDisplayName?: string;
  dimmed?: boolean;
  amActivity?: { at: string; description: string | null } | null;
}) {
  if (clients.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 bg-muted/40 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {amActivity && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(amActivity.at)}
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent bg-muted/40">
              <TableHead className="w-[44px] sm:w-[60px]"></TableHead>
              <TableHead>Klient</TableHead>
              <TableHead className="text-center hidden sm:table-cell">Reklamy</TableHead>
              <TableHead className="text-right hidden md:table-cell">Cíl</TableHead>
              <TableHead className="text-right">Utraceno</TableHead>
              <TableHead className="text-right hidden md:table-cell">Predikce</TableHead>
              <TableHead className="text-center">Stav</TableHead>
              <TableHead className="w-[44px] sm:w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((client) => (
              <TableRow
                key={client.slug}
                className={`cursor-pointer ${dimmed ? "opacity-50" : ""}`}
                onClick={() => onSelectClient(client.slug)}
              >
                <TableCell className="py-2 sm:py-3 px-2 sm:px-4">
                  <ClientLogo slug={client.slug} name={client.name} />
                </TableCell>
                <TableCell className="font-medium text-sm">
                  {client.name}
                  {/* Mobile-only: show ads status inline */}
                  <div className="sm:hidden mt-0.5">
                    {client.adsActive ? (
                      <span className="text-[10px] text-green-600 flex items-center gap-1">
                        <Circle className="h-1.5 w-1.5 fill-green-500 text-green-500" /> Aktivní
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Circle className="h-1.5 w-1.5 fill-muted-foreground/40 text-muted-foreground/40" /> Neaktivní
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center hidden sm:table-cell">
                  {client.adsActive ? (
                    <Badge variant="outline" className="border-green-200 text-green-700 bg-green-50 gap-1.5">
                      <Circle className="h-2 w-2 fill-green-500 text-green-500" />
                      Aktivní
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-muted text-muted-foreground gap-1.5">
                      <Circle className="h-2 w-2 fill-muted-foreground/40 text-muted-foreground/40" />
                      Neaktivní
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right text-muted-foreground hidden md:table-cell">
                  {client.target > 0 ? `${formatCurrency(client.target)} ${currencySymbol(client.currency)}` : "—"}
                </TableCell>
                <TableCell className="text-right text-sm">
                  {formatCurrency(client.spent)} {currencySymbol(client.currency)}
                </TableCell>
                <TableCell className="text-right hidden md:table-cell">
                  {formatCurrency(client.prediction)} {currencySymbol(client.currency)}
                </TableCell>
                <TableCell className="text-center">{pacingBadge(client.pacing, client.deviationPct)}</TableCell>
                <TableCell className="text-right px-1 sm:px-4" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-0.5 sm:gap-1">
                    {userType && userId && (
                      <NotificationSettingsDialog
                        clientSlug={client.slug}
                        clientName={client.name}
                        userType={userType}
                        userId={userId}
                        userDisplayName={userDisplayName}
                      />
                    )}
                    <EcommerceSettings clientSlug={client.slug}>
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Nastavení">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </EcommerceSettings>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// --- Overview (list of all clients with eshop budget) ---

export function EcommerceOverview({
  clients,
  onSelectClient,
  userType,
  userId,
  userDisplayName,
  assignedSlugs: initialAssigned,
  amId,
}: {
  clients: Array<{ slug: string; name: string; display_name?: string | null }>;
  onSelectClient: (slug: string) => void;
  userType?: "admin" | "am";
  userId?: string;
  userDisplayName?: string;
  assignedSlugs?: string[];
  amId?: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [configureSlug, setConfigureSlug] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const isAM = userType === "am";
  const isAdmin = userType === "admin";

  // Fetch ecommerce-specific assigned slugs for AM
  const { data: ecommerceAssignedSlugs = [] } = useQuery({
    queryKey: ["am-ecommerce-assigned", amId],
    queryFn: async () => {
      if (!amId) return [];
      const { data, error } = await supabase
        .from("account_manager_clients")
        .select("client_slug")
        .eq("account_manager_id", amId)
        .eq("section", "ecommerce");
      if (error) throw error;
      return (data || []).map((r) => r.client_slug);
    },
    enabled: isAM && !!amId,
    staleTime: 30_000,
  });

  // Use query data directly as source of truth
  const assignedSlugs = ecommerceAssignedSlugs;

  // adsActive is now computed from fetch-eshop-budget response directly

  // Fetch ecommerce-specific AM assignments for admin grouping
  const { data: ecommerceAmAssignments } = useQuery({
    queryKey: ["ecommerce-am-assignments"],
    queryFn: async () => {
      // Get all ecommerce assignments
      const { data: amcRows, error: amcError } = await supabase
        .from("account_manager_clients")
        .select("account_manager_id, client_slug")
        .eq("section", "ecommerce");
      if (amcError) throw amcError;

      // Get AM display names
      const { data: amRows, error: amError } = await supabase
        .from("account_managers_public")
        .select("id, display_name");
      if (amError) throw amError;

      const amNameMap = new Map<string, string>();
      for (const am of (amRows || [])) {
        amNameMap.set(am.id, am.display_name || "Neznámý");
      }

      const slugToAms = new Map<string, string[]>();
      for (const amc of (amcRows || [])) {
        const name = amNameMap.get(amc.account_manager_id);
        if (!name) continue;
        const arr = slugToAms.get(amc.client_slug) || [];
        if (!arr.includes(name)) arr.push(name);
        slugToAms.set(amc.client_slug, arr);
      }

      return Object.fromEntries(slugToAms);
    },
    staleTime: 30_000,
    enabled: isAdmin,
  });

  // Fetch all clients + eshop-configured clients via single backend call
  const { data: eshopListData, isLoading: isListLoading } = useQuery({
    queryKey: ["eshop-client-list"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-eshop-config", {
        body: { action: "list" },
      });
      if (error) throw error;
      return data as {
        eshopClients: Array<{ slug: string; name: string; display_name: string | null }>;
        allClients: Array<{ slug: string; name: string; display_name: string | null }>;
      };
    },
    staleTime: 60_000,
  });

  const allClients = eshopListData?.allClients || [];
  const eshopClientSlugs = new Set((eshopListData?.eshopClients || []).map((c) => c.slug));

  // Fetch budget data for eshop-configured clients
  const { data: configuredClients, isLoading } = useQuery({
    queryKey: ["eshop-configured-clients", eshopListData?.eshopClients?.length, ecommerceAmAssignments ? "y" : "n"],
    queryFn: async () => {
      const clientList = eshopListData?.eshopClients || [];

      const settled = await Promise.allSettled(
        clientList.map(async (client) => {
          const { data: budgetData } = await supabase.functions.invoke("fetch-eshop-budget", {
            body: { client_slug: client.slug },
          });
          return { client, budgetData };
        })
      );

      return settled.map((r, i) => {
        const client = clientList[i];
        if (r.status === "fulfilled" && r.value.budgetData && !r.value.budgetData.error && r.value.budgetData.total) {
          const bd = r.value.budgetData;
          return {
            slug: client.slug,
            name: client.display_name || client.name,
            pacing: bd.total.pacing,
            deviationPct: bd.total.deviationPct,
            spent: bd.total.spentThisMonth,
            target: bd.total.target,
            prediction: bd.total.prediction,
            adsActive: bd.adsActive ?? false,
            currency: bd.currency || "CZK",
            accountManagers: ecommerceAmAssignments?.[client.slug] || [],
          } as EshopConfiguredClient;
        }
        return {
          slug: client.slug,
          name: client.display_name || client.name,
          pacing: "on_target" as const,
          deviationPct: 0,
          spent: 0,
          target: 0,
          prediction: 0,
          adsActive: false,
          accountManagers: ecommerceAmAssignments?.[client.slug] || [],
        } as EshopConfiguredClient;
      });
    },
    staleTime: 5 * 60_000,
    enabled: !!(eshopListData?.eshopClients && eshopListData.eshopClients.length > 0),
  });

  const amActivity: Record<string, { at: string; description: string | null }> = {};

  // AM client assignment mutation (ecommerce-specific)
  const toggleMutation = useMutation({
    mutationFn: async ({ slug, assign }: { slug: string; assign: boolean }) => {
      if (!amId) throw new Error("No AM ID");
      const { data, error } = await supabase.functions.invoke("manage-am-clients", {
        body: { amId, clientSlug: slug, action: assign ? "assign" : "unassign", section: "ecommerce" },
      });
      if (error) throw error;
      return { slug, assign };
    },
    onMutate: async ({ slug, assign }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ["am-ecommerce-assigned", amId] });
      const prev = queryClient.getQueryData<string[]>(["am-ecommerce-assigned", amId]) || [];
      queryClient.setQueryData(
        ["am-ecommerce-assigned", amId],
        assign ? [...prev, slug] : prev.filter((s) => s !== slug)
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(["am-ecommerce-assigned", amId], context.prev);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["am-ecommerce-assigned", amId] });
    },
    onSettled: (_data, _err, { assign }) => {
      toast({ description: assign ? "Klient přiřazen" : "Klient odebrán" });
    },
  });

  const configuredSlugs = new Set((configuredClients || []).map((c) => c.slug));
  const unconfiguredClients = (allClients || []).filter((c) => !configuredSlugs.has(c.slug));

  const handleAddClient = (slug: string) => {
    setAddClientOpen(false);
    setConfigureSlug(slug);
  };

  // Group configured clients for display
  const getGroupedClients = (): Array<{ title: string; clients: EshopConfiguredClient[]; dimmed?: boolean; amActivityData?: { at: string; description: string | null } | null }> => {
    if (!configuredClients || configuredClients.length === 0) return [];

    if (isAdmin) {
      const grouped = new Map<string, EshopConfiguredClient[]>();
      const unassigned: EshopConfiguredClient[] = [];

      for (const client of configuredClients) {
        const ams = client.accountManagers || [];
        if (ams.length === 0) {
          unassigned.push(client);
        } else {
          for (const am of ams) {
            const arr = grouped.get(am) || [];
            arr.push(client);
            grouped.set(am, arr);
          }
        }
      }

      const sections: Array<{ title: string; clients: EshopConfiguredClient[]; amActivityData?: { at: string; description: string | null } | null }> = [];
      const amNames = [...grouped.keys()].sort();
      for (const name of amNames) {
        const sorted = grouped.get(name)!.slice().sort((a, b) => a.name.localeCompare(b.name, "cs"));
        sections.push({ title: name, clients: sorted, amActivityData: amActivity[name] });
      }
      if (unassigned.length > 0) {
        sections.push({ title: "Nepřiřazení", clients: unassigned.slice().sort((a, b) => a.name.localeCompare(b.name, "cs")) });
      }
      return sections;
    }

    if (isAM) {
      const sortByName = (a: EshopConfiguredClient, b: EshopConfiguredClient) => a.name.localeCompare(b.name, "cs");
      const my = configuredClients.filter((c) => assignedSlugs.includes(c.slug)).sort(sortByName);
      const other = configuredClients.filter((c) => !assignedSlugs.includes(c.slug)).sort(sortByName);
      const sections: Array<{ title: string; clients: EshopConfiguredClient[]; dimmed?: boolean }> = [];
      if (my.length > 0) sections.push({ title: "Moji klienti", clients: my });
      if (other.length > 0) sections.push({ title: "Ostatní klienti", clients: other, dimmed: true });
      return sections;
    }

    return [{ title: `E-shop klienti (${configuredClients.length})`, clients: configuredClients }];
  };

  const grouped = getGroupedClients();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:h-[56px] flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0 justify-between">
          <div className="flex items-center">
            <h1 className="text-sm font-semibold tracking-tight text-foreground">E-shop Budget Pacing</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="gap-1.5 flex-1 sm:flex-none" onClick={() => setAddClientOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Nový klient</span><span className="sm:hidden">Nový</span>
            </Button>
            {isAM && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 flex-1 sm:flex-none"
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{showSettings ? "Hotovo" : "Nastavit klienty"}</span>
                <span className="sm:hidden">{showSettings ? "Hotovo" : "Nastavit"}</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 py-4 sm:py-8">
        {(isLoading || isListLoading) ? (
          <PageSpinner label="Načítám e-shop klienty…" />
        ) : showSettings && isAM ? (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/30">
              <p className="text-sm text-muted-foreground">Vyberte klienty, které spravujete v ecommerce</p>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                  <TableHead>Klient</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(allClients || [])
                  .slice()
                  .sort((a, b) => {
                    const aAssigned = assignedSlugs.includes(a.slug) ? 0 : 1;
                    const bAssigned = assignedSlugs.includes(b.slug) ? 0 : 1;
                    return aAssigned - bAssigned;
                  })
                  .map((client) => {
                    const isAssigned = assignedSlugs.includes(client.slug);
                    return (
                      <TableRow
                        key={client.slug}
                        className={`cursor-pointer ${!isAssigned ? "opacity-50" : ""}`}
                        onClick={() => {
                          if (!toggleMutation.isPending) {
                            toggleMutation.mutate({ slug: client.slug, assign: !isAssigned });
                          }
                        }}
                      >
                        <TableCell>
                          <Checkbox
                            checked={isAssigned}
                            disabled={toggleMutation.isPending}
                          />
                        </TableCell>
                        <TableCell>
                          <ClientLogo slug={client.slug} name={client.display_name || client.name} />
                        </TableCell>
                        <TableCell className="font-medium">
                          {client.display_name || client.name}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>
        ) : !configuredClients || configuredClients.length === 0 ? (
          <div className="text-center py-12 space-y-4">
            <p className="text-muted-foreground">Žádní klienti s nakonfigurovaným e-shop rozpočtem</p>
            <Button size="sm" onClick={() => setAddClientOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> Nový klient
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map((section) => (
              <EcommerceClientTable
                key={section.title}
                title={section.title}
                clients={section.clients}
                onSelectClient={onSelectClient}
                userType={userType}
                userId={userId}
                userDisplayName={userDisplayName}
                dimmed={section.dimmed}
                amActivity={section.amActivityData}
              />
            ))}
            {grouped.length === 0 && (
              <p className="text-center text-muted-foreground py-12">Žádní klienti</p>
            )}
            {isAM && assignedSlugs.length === 0 && configuredClients.length > 0 && (
              <p className="text-center text-sm text-muted-foreground">
                Nemáte přiřazené žádné klienty. Klikněte na „Nastavit klienty" pro přiřazení.
              </p>
            )}
          </div>
        )}
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6 pt-2 text-center">
        <p className="text-xs text-muted-foreground/60">Developed by Performind</p>
      </footer>

      <Dialog open={addClientOpen} onOpenChange={setAddClientOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Přidat klienta do Ecommerce</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {unconfiguredClients.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Existující klienti</p>
                <div className="space-y-1 max-h-[250px] overflow-y-auto">
                  {unconfiguredClients.map((client) => (
                    <button
                      key={client.slug}
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
                      onClick={() => handleAddClient(client.slug)}
                    >
                      <ClientLogo slug={client.slug} name={client.display_name || client.name} />
                      <span className="text-sm font-medium">{client.display_name || client.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="border-t border-border pt-3">
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5"
                onClick={() => {
                  setAddClientOpen(false);
                  setWizardOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Vytvořit nového klienta
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {configureSlug && (
        <EcommerceSettingsAutoOpen
          clientSlug={configureSlug}
          onClose={() => {
            setConfigureSlug(null);
            queryClient.invalidateQueries({ queryKey: ["eshop-client-list"] });
            queryClient.invalidateQueries({ queryKey: ["eshop-configured-clients"] });
          }}
        />
      )}

      <CreateClientWizard open={wizardOpen} onOpenChange={setWizardOpen} defaultSection="ecommerce" />
    </div>
  );
}

/** Auto-opens EcommerceSettings dialog when mounted */
function EcommerceSettingsAutoOpen({ clientSlug, onClose }: { clientSlug: string; onClose: () => void }) {
  return <EcommerceSettings clientSlug={clientSlug} autoOpen onAutoClose={onClose} />;
}

// --- Client Detail Page (used when slug selected in ecommerce mode) ---

export function EcommerceClientPage({
  clientSlug,
  clientName,
  onBack,
}: {
  clientSlug: string;
  clientName: string;
  onBack?: () => void;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:h-[56px] flex items-center justify-between">
          <div className="flex items-center">
            <h1 className="text-sm font-semibold tracking-tight text-foreground">{clientName}</h1>
          </div>
          <div className="flex items-center gap-2">
            {onBack && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={onBack}>
                <ChevronDown className="h-3.5 w-3.5 rotate-90" />
                Zpět
              </Button>
            )}
            <EcommerceSettings clientSlug={clientSlug} />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <EcommerceClientDetail clientSlug={clientSlug} clientName={clientName} />
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6 pt-2 text-center">
        <p className="text-xs text-muted-foreground/60">Developed by Performind</p>
      </footer>
    </div>
  );
}
