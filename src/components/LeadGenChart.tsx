import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MonthlyData, Granularity, Lead, CostRow } from "@/hooks/useLeadGen";
import {
  useSourceComparisonConfig,
  useSaveSourceComparisonConfig,
  buildComparisonData,
  getComparisonColor,
  SourceComparisonData,
  MatchType,
} from "@/hooks/useSourceComparison";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { DateRange } from "react-day-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  data: MonthlyData[];
  granularity?: Granularity;
  clientSlug?: string;
  leads?: Lead[];
  costs?: CostRow[];
  dateRange?: DateRange;
}

const formatCZK = (v: number) =>
  new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(v);
const formatCZKOrNA = (v: number) => v > 0 ? formatCZK(v) : "—";

type View = "leads" | "investment" | "comparison";

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "13px",
  color: "hsl(var(--card-foreground))",
  padding: "8px 12px",
};

const subtextStyle = {
  color: "hsl(var(--muted-foreground))",
  fontSize: 11,
  marginTop: 4,
  borderTop: "1px solid hsl(var(--border))",
  paddingTop: 4,
};

function ComparisonConfig({
  sources,
  campaigns,
  adsets,
  ads,
  initialMappings,
  initialMatchType,
  onSave,
  saving,
}: {
  sources: string[];
  campaigns: string[];
  adsets: string[];
  ads: string[];
  initialMappings: Record<string, string[]>;
  initialMatchType: MatchType;
  onSave: (mappings: Record<string, string[]>, matchType: MatchType) => void;
  saving: boolean;
}) {
  const [matchType, setMatchType] = useState<MatchType>(initialMatchType);
  const [mappings, setMappings] = useState<Record<string, string[]>>(() => {
    const m: Record<string, string[]> = {};
    for (const s of sources) m[s] = initialMappings[s] || [];
    return m;
  });

  const items = matchType === "adset" ? adsets : matchType === "ad" ? ads : campaigns;
  const itemLabel = matchType === "adset" ? "reklamní sady" : matchType === "ad" ? "reklamy" : "kampaně";

  const handleMatchTypeChange = (v: string) => {
    setMatchType(v as MatchType);
    // Reset mappings when changing level
    const m: Record<string, string[]> = {};
    for (const s of sources) m[s] = [];
    setMappings(m);
  };

  const toggleItem = (source: string, item: string) => {
    setMappings((prev) => {
      const arr = prev[source] || [];
      const next = arr.includes(item)
        ? arr.filter((c) => c !== item)
        : [...arr, item];
      return { ...prev, [source]: next };
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground shrink-0">Úroveň přiřazení:</span>
        <Select value={matchType} onValueChange={handleMatchTypeChange}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="campaign">Kampaň</SelectItem>
            {adsets.length > 0 && <SelectItem value="adset">Reklamní sada</SelectItem>}
            {ads.length > 0 && <SelectItem value="ad">Reklama</SelectItem>}
          </SelectContent>
        </Select>
      </div>
      <div className="text-sm text-muted-foreground">
        Přiřaďte {itemLabel} k jednotlivým zdrojům poptávek pro porovnání CPL.
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${sources.length}, 1fr)` }}>
        {sources.map((source, idx) => (
          <div key={source} className="space-y-2">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: getComparisonColor(idx) }}
              />
              <span className="text-sm font-medium truncate">{source}</span>
            </div>
            <div className="max-h-[200px] overflow-y-auto space-y-1 border border-border/50 rounded-md p-2">
              {items.length === 0 && (
                <div className="text-xs text-muted-foreground py-2">Žádné {itemLabel}</div>
              )}
              {items.map((item) => (
                <label
                  key={item}
                  className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5"
                >
                  <Checkbox
                    checked={mappings[source]?.includes(item)}
                    onCheckedChange={() => toggleItem(source, item)}
                  />
                  <span className="truncate">{item}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={() => onSave(mappings, matchType)} disabled={saving}>
          {saving ? <Spinner size="sm" /> : "Uložit a zobrazit"}
        </Button>
      </div>
    </div>
  );
}

function ComparisonChart({
  data,
  sources,
  granularity,
}: {
  data: SourceComparisonData[];
  sources: string[];
  granularity: Granularity;
}) {
  const useAvg = granularity === "week" || granularity === "month";

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 20, right: 10, left: 10, bottom: 5 }} barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          width={35}
        />
        <Tooltip
          content={({ active, payload, label }: any) => {
            if (!active || !payload?.length) return null;
            const item = payload[0]?.payload as SourceComparisonData;
            return (
              <div style={tooltipStyle}>
                <div style={{ fontWeight: 500, marginBottom: 6 }}>{label}</div>
                {sources.map((src, idx) => {
                  const total = (item[`${src}_total`] as number) || 0;
                  const qualified = (item[`${src}_qualified`] as number) || 0;
                  const cost = (item[`${src}_cost`] as number) || 0;
                  const cpl = item[`${src}_cpl`] as number | null;
                  const pct = total > 0 ? ((qualified / total) * 100).toFixed(0) : "0";
                  return (
                    <div key={src} style={{ marginBottom: 6 }}>
                      <div style={{ color: getComparisonColor(idx), fontWeight: 500, marginBottom: 2 }}>
                        {src}
                      </div>
                      <div style={{ fontSize: 12 }}>
                        Celkem: {total} · Kval.: {qualified} ({pct} %)
                      </div>
                      {cost > 0 && (
                        <div style={{ fontSize: 12 }}>
                          Investice: {formatCZK(cost)} · CPL: {cpl != null ? formatCZK(cpl) : "—"}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          }}
        />
        <Legend />
        {sources.map((src, idx) => (
          <Bar
            key={src}
            dataKey={`${src}_total`}
            name={src}
            fill={getComparisonColor(idx)}
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LeadGenChart({ data, granularity = "month", clientSlug, leads, costs, dateRange }: Props) {
  const [view, setView] = useState<View>("leads");
  const useAvg = granularity === "week" || granularity === "month";
  const [showConfig, setShowConfig] = useState(false);

  // Source comparison config
  const configQuery = useSourceComparisonConfig(clientSlug || "");
  const saveMutation = useSaveSourceComparisonConfig(clientSlug || "");

  const hasMultipleSources = (configQuery.data?.sources?.length || 0) > 1;
  const hasMappings = Object.keys(configQuery.data?.mappings || {}).length > 0;

  // When switching to comparison for the first time without mappings, show config
  const handleViewChange = (v: string) => {
    const newView = v as View;
    setView(newView);
    if (newView === "comparison") {
      configQuery.refetch();
      if (!hasMappings) setShowConfig(true);
    }
  };

  const handleSaveConfig = (mappings: Record<string, string[]>, matchType: MatchType) => {
    saveMutation.mutate({ mappings, matchType }, {
      onSuccess: () => setShowConfig(false),
    });
  };

  const comparisonData = useMemo(() => {
    if (view !== "comparison" || !leads || !costs || !configQuery.data?.sources?.length) return [];
    return buildComparisonData(
      leads,
      costs,
      configQuery.data.mappings || {},
      configQuery.data.sources,
      dateRange,
      granularity,
      configQuery.data.matchType || "campaign"
    );
  }, [view, leads, costs, configQuery.data, dateRange, granularity]);

  const chartData = useMemo(() => {
    const firstActiveIdx = data.findIndex((m) => m.totalLeads > 0 || m.adCost > 0);
    const trimmed = firstActiveIdx > 0 ? data.slice(firstActiveIdx) : data;

    return trimmed.map((m) => ({
      ...m,
      displayQualified: useAvg ? m.avgQualifiedLeads : m.qualifiedLeads,
      displayUnqualified: useAvg ? m.avgUnqualifiedLeads : (m.totalLeads - m.qualifiedLeads),
      displayTotal: useAvg ? m.avgTotalLeads : m.totalLeads,
      displayAdCost: m.adCost > 0 ? (useAvg ? m.avgAdCost : m.adCost) : null,
      displayCpl: m.totalLeads > 0 ? m.avgCpl : null,
      displayCplQualified: m.qualifiedLeads > 0 ? m.avgCplQualified : null,
    }));
  }, [data, useAvg]);

  const tooltipPrefix = granularity === "day" ? "Den" : granularity === "week" ? "Týden" : "Měsíc";

  return (
    <Card className="border border-border/50 shadow-sm bg-card">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-[family-name:var(--font-heading)]">
          {view === "leads" ? "Poptávky" : view === "investment" ? "Investice" : "Porovnání zdrojů"}
        </CardTitle>
        <div className="flex items-center gap-2">
          {view === "comparison" && hasMappings && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={() => setShowConfig(!showConfig)}
            >
              {showConfig ? "Zavřít" : "Upravit"}
            </Button>
          )}
          <Tabs value={view} onValueChange={handleViewChange}>
            <TabsList className="h-8">
              <TabsTrigger value="leads" className="text-xs px-3 h-7">Poptávky</TabsTrigger>
              <TabsTrigger value="investment" className="text-xs px-3 h-7">Investice</TabsTrigger>
              {hasMultipleSources && (
                <TabsTrigger value="comparison" className="text-xs px-3 h-7">Porovnání</TabsTrigger>
              )}
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {view === "comparison" ? (
          showConfig && configQuery.data ? (
            <ComparisonConfig
              sources={configQuery.data.sources}
              campaigns={configQuery.data.campaigns}
              adsets={configQuery.data.adsets || []}
              ads={configQuery.data.ads || []}
              initialMappings={configQuery.data.mappings}
              initialMatchType={configQuery.data.matchType || "campaign"}
              onSave={handleSaveConfig}
              saving={saveMutation.isPending}
            />
          ) : configQuery.isLoading ? (
            <div className="flex items-center justify-center h-[350px]">
              <Spinner size="lg" label="Načítám konfiguraci…" />
            </div>
          ) : (
            <div className="h-[350px]">
              <ComparisonChart
                data={comparisonData}
                sources={configQuery.data?.sources || []}
                granularity={granularity}
              />
            </div>
          )
        ) : (
          <div className="h-[350px]">
            {view === "leads" ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 10, left: 10, bottom: 5 }} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    width={35}
                    allowDecimals={useAvg}
                  />
                  <Tooltip
                    content={({ active, payload, label }: any) => {
                      if (!active || !payload?.length) return null;
                      const item = payload[0]?.payload as MonthlyData;
                      const pct = item?.totalLeads > 0 ? ((item.qualifiedLeads / item.totalLeads) * 100).toFixed(1) : "0";
                      return (
                        <div style={tooltipStyle}>
                          <div style={{ fontWeight: 500, marginBottom: 4 }}>{tooltipPrefix}: {label}</div>
                          {useAvg ? (
                            <>
                              <div style={{ marginBottom: 2 }}>
                                Průměrně <strong>{item.avgTotalLeads.toFixed(1)}</strong> poptávek / den
                              </div>
                              <div style={{ color: "hsl(78, 80%, 38%)", marginBottom: 2 }}>
                                z toho kval.: {item.avgQualifiedLeads.toFixed(1)} / den
                              </div>
                              <div style={subtextStyle}>
                                Celkem za období ({item.days} dní): {item.totalLeads} poptávek
                                <br />
                                Kvalifikovaných: {item.qualifiedLeads} ({pct} %)
                                <br />
                                Nekvalifikovaných: {item.totalLeads - item.qualifiedLeads}
                              </div>
                            </>
                          ) : (
                            <>
                              <div style={{ color: "hsl(78, 80%, 38%)", marginBottom: 2 }}>
                                Kvalifikované: {item.qualifiedLeads}
                              </div>
                              <div style={{ color: "#4f11ff", marginBottom: 2 }}>
                                Nekvalifikované: {item.totalLeads - item.qualifiedLeads}
                              </div>
                              <div style={subtextStyle}>
                                Kvalifikovaných: {pct} %
                              </div>
                            </>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Legend />
                  <Bar
                    dataKey="displayQualified"
                    name="Kvalifikované"
                    stackId="leads"
                    fill="#b0f221"
                    radius={[0, 0, 0, 0]}
                    maxBarSize={32}
                  />
                  <Bar
                    dataKey="displayUnqualified"
                    name="Nekvalifikované"
                    stackId="leads"
                    fill="#4f11ff"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                    label={({ x, y, width, index }: any) => {
                      const item = chartData[index];
                      if (!item || item.totalLeads === 0) return null;
                      const pctVal = ((item.qualifiedLeads / item.totalLeads) * 100).toFixed(0);
                      return (
                        <text
                          x={x + width / 2}
                          y={y - 6}
                          textAnchor="middle"
                          fontSize={10}
                          fill="hsl(var(--muted-foreground))"
                        >
                          {pctVal}%
                        </text>
                      );
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="cost"
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 11, fill: "#070707" }}
                    tickLine={false}
                    axisLine={false}
                    width={45}
                  />
                  <YAxis
                    yAxisId="cpl"
                    orientation="right"
                    tickFormatter={(v) => formatCZK(v)}
                    tick={{ fontSize: 11, fill: "#4f11ff" }}
                    tickLine={false}
                    axisLine={false}
                    width={70}
                  />
                  <Tooltip
                    content={({ active, payload, label }: any) => {
                      if (!active || !payload?.length) return null;
                      const item = payload[0]?.payload as MonthlyData;
                      return (
                        <div style={tooltipStyle}>
                          <div style={{ fontWeight: 500, marginBottom: 4 }}>{tooltipPrefix}: {label}</div>
                          {useAvg ? (
                            <>
                              <div style={{ marginBottom: 2 }}>
                                Investice: Ø <strong>{formatCZK(item.avgAdCost)}</strong> / den
                              </div>
                              <div style={{ color: "#4f11ff", marginBottom: 2 }}>
                                CPL: {formatCZKOrNA(item.avgCpl)}
                              </div>
                              <div style={{ color: "hsl(78, 80%, 38%)", marginBottom: 2 }}>
                                CPL kval.: {formatCZKOrNA(item.avgCplQualified)}
                              </div>
                              <div style={subtextStyle}>
                                Celkem za období ({item.days} dní): {formatCZK(item.adCost)}
                              </div>
                            </>
                          ) : (
                            <>
                              <div style={{ marginBottom: 2 }}>
                                Investice: {formatCZK(item.adCost)}
                              </div>
                              <div style={{ color: "#4f11ff", marginBottom: 2 }}>
                                CPL: {formatCZKOrNA(item.avgCpl)}
                              </div>
                              <div style={{ color: "hsl(78, 80%, 38%)", marginBottom: 2 }}>
                                CPL kval.: {formatCZKOrNA(item.avgCplQualified)}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Legend />
                  <Line
                    yAxisId="cost"
                    dataKey="displayAdCost"
                    name={useAvg ? "Ø investice / den" : "Celková investice"}
                    stroke="#070707"
                    strokeWidth={2}
                    dot={{ r: 2, fill: "#070707" }}
                    activeDot={{ r: 4 }}
                    connectNulls={false}
                    type="monotone"
                  />
                  <Line
                    yAxisId="cpl"
                    dataKey="displayCpl"
                    name="Cena za poptávku"
                    stroke="#4f11ff"
                    strokeWidth={2}
                    dot={{ r: 2, fill: "#4f11ff" }}
                    activeDot={{ r: 4 }}
                    connectNulls={false}
                    type="monotone"
                  />
                  <Line
                    yAxisId="cpl"
                    dataKey="displayCplQualified"
                    name="Cena za kval. poptávku"
                    stroke="hsl(78, 80%, 38%)"
                    strokeWidth={2}
                    dot={{ r: 2, fill: "hsl(78, 80%, 38%)" }}
                    activeDot={{ r: 4 }}
                    connectNulls={false}
                    type="monotone"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
