import { useState, useEffect, useCallback } from "react";
import { WRITEBACK_FIELDS, WRITEBACK_STATUS } from "@/lib/writeback-contract";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useEshopConfig } from "@/hooks/useEshopBudget";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import {
  Settings,
  Settings2,
  Plus,
  Trash2,
  Save,
  BookOpen,
  Copy,
  Check,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Filter,
  Hash,
  Tag,
  Car,
  MapPin,
  Globe,
  Briefcase,
  Package,
  Star,
  DollarSign,
  ShoppingCart,
  FileText,
  Clock,
  Truck,
  Home,
  Users,
  Layers,
  BarChart3,
  Sparkles,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";

/* ── helpers ── */

function colLetterToIndex(letter: string): number {
  const l = letter.toUpperCase().trim();
  if (!l || !/^[A-Z]+$/.test(l)) return -1;
  let idx = 0;
  for (let i = 0; i < l.length; i++) idx = idx * 26 + (l.charCodeAt(i) - 64);
  return idx - 1;
}

function indexToColLetter(index: number): string {
  if (index < 0) return "";
  let letter = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

interface QualValue { value: string; isQualified: boolean }
interface CustomCol { id: string; name: string; column: string; icon?: string }
interface BudgetTarget { channel: string; target_amount: number }

const CUSTOM_COL_ICONS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "hash", label: "#", icon: Hash },
  { value: "tag", label: "Štítek", icon: Tag },
  { value: "car", label: "Auto", icon: Car },
  { value: "map-pin", label: "Místo", icon: MapPin },
  { value: "globe", label: "Web", icon: Globe },
  { value: "briefcase", label: "Práce", icon: Briefcase },
  { value: "package", label: "Balík", icon: Package },
  { value: "star", label: "Hvězda", icon: Star },
  { value: "dollar", label: "Cena", icon: DollarSign },
  { value: "cart", label: "Košík", icon: ShoppingCart },
  { value: "file", label: "Soubor", icon: FileText },
  { value: "clock", label: "Čas", icon: Clock },
  { value: "truck", label: "Doprava", icon: Truck },
  { value: "home", label: "Dům", icon: Home },
  { value: "users", label: "Lidé", icon: Users },
  { value: "layers", label: "Vrstvy", icon: Layers },
];

function getCustomColIcon(iconValue?: string): LucideIcon | null {
  if (!iconValue) return null;
  return CUSTOM_COL_ICONS.find((i) => i.value === iconValue)?.icon || null;
}

interface SourceConfig {
  columns?: Record<string, number>;
  default_qualified?: string;
  qualification?: { qualified_values: string[]; not_qualified_values: string[] };
  name_split?: boolean;
  custom_columns?: { name: string; column: number; icon?: string }[];
  crm_fields?: Record<string, unknown>;
  writeback_url?: string;
  web_filter?: string;
  source_name?: string;
}

interface SourceRow {
  id?: string;
  source_type: string;
  source_urls: string[];
  config: SourceConfig;
}

interface Props {
  clientSlug: string;
}

/* ── Dialog shell ── */

export function ClientSettingsDialog({ clientSlug }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[920px] h-[680px] p-0 gap-0 flex flex-col overflow-hidden">
        {open && (
          <SettingsContent
            clientSlug={clientSlug}
            onClose={() => setOpen(false)}
            toast={toast}
            queryClient={queryClient}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Main content ── */

type NavSection = "general" | "leadgen" | "ecommerce" | "creative";

function SettingsContent({
  clientSlug,
  onClose,
  toast,
  queryClient,
}: {
  clientSlug: string;
  onClose: () => void;
  toast: ReturnType<typeof useToast>["toast"];
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [activeSection, setActiveSection] = useState<NavSection>("general");

  /* module flags */
  const [leadEnabled, setLeadEnabled] = useState(false);
  const [ecommerceEnabled, setEcommerceEnabled] = useState(false);
  const [creativeEnabled, setCreativeEnabled] = useState(false);

  /* general */
  const [displayName, setDisplayName] = useState("");

  /* leadgen */
  const [leadSources, setLeadSources] = useState<{ url: string; config: SourceConfig }[]>([{ url: "", config: {} }]);
  const [costUrls, setCostUrls] = useState<string[]>([""]);
  const [costWebFilter, setCostWebFilter] = useState("");

  /* ecommerce */
  const [sourceUrl, setSourceUrl] = useState("");
  const [excludedCampaigns, setExcludedCampaigns] = useState("");
  const [budgetMode, setBudgetMode] = useState<"total" | "per_channel">("total");
  const [eshopWebFilter, setEshopWebFilter] = useState("");
  const [currency, setCurrency] = useState<"CZK" | "EUR">("CZK");
  const [targets, setTargets] = useState<BudgetTarget[]>([{ channel: "_total", target_amount: 0 }]);

  /* queries */
  const { data, isLoading: leadLoading } = useQuery({
    queryKey: ["client-config", clientSlug],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-client-config", {
        body: { action: "get", client_slug: clientSlug },
      });
      if (error) throw error;
      return data as {
        client: { id: string; name: string; display_name: string | null; slug: string };
        sources: SourceRow[];
      };
    },
  });

  const { data: eshopConfig, isLoading: eshopLoading } = useEshopConfig(clientSlug);

  /* populate lead/cost */
  useEffect(() => {
    if (!data) return;
    setDisplayName(data.client.display_name || "");
    const leads = data.sources.filter((s) => s.source_type === "leads");
    const costs = data.sources.filter((s) => s.source_type === "marketing_costs" || s.source_type === "ad_costs");

    if (leads.length > 0) {
      const expanded: { url: string; config: SourceConfig }[] = [];
      for (const src of leads) {
        for (const url of src.source_urls) {
          expanded.push({ url, config: { ...src.config } });
        }
      }
      if (expanded.length > 0) {
        setLeadSources(expanded);
        setLeadEnabled(true);
      }
    }
    if (costs.length > 0) {
      setCostUrls(costs.flatMap((c) => c.source_urls).filter(Boolean));
      const wf = costs[0]?.config?.web_filter;
      if (wf) setCostWebFilter(wf as string);
    }
  }, [data]);

  /* populate eshop */
  useEffect(() => {
    if (!eshopConfig) return;
    const url = eshopConfig.source?.source_urls?.[0];
    if (url) {
      setSourceUrl(url);
      setEcommerceEnabled(true);
    }
    const cfg = eshopConfig.source?.config || {};
    setExcludedCampaigns((cfg.excluded_campaigns as string) || "");
    setBudgetMode((cfg.budget_mode as "total" | "per_channel") || "total");
    setEshopWebFilter((cfg.web_filter as string) || "");
    setCurrency((cfg.currency as "CZK" | "EUR") || "CZK");
    if (eshopConfig.targets?.length > 0) {
      setTargets(eshopConfig.targets.map((t) => ({ channel: t.channel, target_amount: Number(t.target_amount) })));
    }
  }, [eshopConfig]);

  /* save */
  const saveMutation = useMutation({
    mutationFn: async () => {
      const now = new Date();

      const sources: SourceRow[] = [];
      if (leadEnabled) {
        for (const ls of leadSources) {
          if (!ls.url.trim()) continue;
          sources.push({ source_type: "leads", source_urls: [ls.url], config: { ...ls.config } });
        }
        const filteredCost = costUrls.filter((u) => u.trim());
        if (filteredCost.length > 0) {
          const costConfig: SourceConfig = {};
          if (costWebFilter) costConfig.web_filter = costWebFilter;
          sources.push({ source_type: "marketing_costs", source_urls: filteredCost, config: costConfig });
        }
      }

      const ops: Promise<{ error: unknown }>[] = [
        supabase.functions.invoke("manage-client-config", {
          body: { action: "update", client_slug: clientSlug, sources, display_name: displayName },
        }),
      ];

      if (ecommerceEnabled && sourceUrl.trim()) {
        ops.push(
          supabase.functions.invoke("manage-eshop-config", {
            body: {
              action: "update",
              client_slug: clientSlug,
              source_url: sourceUrl,
              excluded_campaigns: excludedCampaigns,
              budget_mode: budgetMode,
              web_filter: eshopWebFilter,
              currency,
              budget_targets: targets,
              month: now.getMonth() + 1,
              year: now.getFullYear(),
            },
          })
        );
      }

      const results = await Promise.all(ops);
      for (const r of results) {
        if (r.error) throw r.error;
      }
    },
    onSuccess: () => {
      toast({ description: "Nastavení uloženo" });
      queryClient.invalidateQueries({ queryKey: ["client-config", clientSlug] });
      queryClient.invalidateQueries({ queryKey: ["eshop-config", clientSlug] });
      queryClient.invalidateQueries({ queryKey: ["eshop-budget", clientSlug] });
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      queryClient.invalidateQueries({ queryKey: ["clients-hub"] });
      onClose();
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message });
    },
  });

  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { data: res, error } = await supabase.functions.invoke("manage-client-config", {
        body: { action: "delete", client_slug: clientSlug },
      });
      if (error) throw error;
      if (res?.error) throw new Error(res.error);
    },
    onSuccess: () => {
      toast({ description: `Klient byl odebrán` });
      queryClient.invalidateQueries({ queryKey: ["clients-hub"] });
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      onClose();
    },
    onError: (err: Error) => {
      setDeleteConfirm(false);
      toast({ variant: "destructive", description: err.message });
    },
  });

  const clientName = data?.client?.display_name || data?.client?.name || clientSlug;

  const navItems = [
    { id: "general" as NavSection, label: "Obecné", icon: Settings2 },
    { id: "leadgen" as NavSection, label: "LeadGen", icon: BarChart3, enabled: leadEnabled },
    { id: "ecommerce" as NavSection, label: "Ecommerce", icon: ShoppingCart, enabled: ecommerceEnabled },
    { id: "creative" as NavSection, label: "Creative Lab", icon: Sparkles, enabled: creativeEnabled },
  ];

  if (leadLoading || eshopLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="md" label="Načítám konfiguraci…" />
      </div>
    );
  }

  return (
    <>
      <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0">
        <DialogTitle className="text-base font-semibold">
          {clientName} — Konfigurace
        </DialogTitle>
      </DialogHeader>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar nav */}
        <aside className="w-56 border-r border-border bg-muted/20 py-3 px-2 flex flex-col gap-0.5 flex-shrink-0">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              className={cn(
                "w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-left transition-colors",
                activeSection === item.id
                  ? "bg-[#4f11ff] text-white font-semibold shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
              {"enabled" in item && (
                <span
                  className={cn(
                    "ml-auto h-2 w-2 rounded-full flex-shrink-0",
                    item.enabled ? "bg-[#b0f221]" : "bg-muted-foreground/20"
                  )}
                />
              )}
            </button>
          ))}
        </aside>

        {/* Content */}
        <div className="flex-1 flex flex-col min-h-0">
          <ScrollArea className="flex-1 px-6 py-5">
            {activeSection === "general" && (
              <GeneralSection
                displayName={displayName}
                onDisplayNameChange={setDisplayName}
                leadEnabled={leadEnabled}
                ecommerceEnabled={ecommerceEnabled}
                creativeEnabled={creativeEnabled}
              />
            )}
            {activeSection === "leadgen" && (
              <LeadGenSection
                enabled={leadEnabled}
                onEnabledChange={setLeadEnabled}
                leadSources={leadSources}
                onLeadSourcesChange={setLeadSources}
                costUrls={costUrls}
                onCostUrlsChange={setCostUrls}
                costWebFilter={costWebFilter}
                onCostWebFilterChange={setCostWebFilter}
                clientSlug={clientSlug}
                clientName={clientName}
              />
            )}
            {activeSection === "ecommerce" && (
              <EcommerceSection
                enabled={ecommerceEnabled}
                onEnabledChange={setEcommerceEnabled}
                sourceUrl={sourceUrl}
                onSourceUrlChange={setSourceUrl}
                excludedCampaigns={excludedCampaigns}
                onExcludedCampaignsChange={setExcludedCampaigns}
                budgetMode={budgetMode}
                onBudgetModeChange={setBudgetMode}
                webFilter={eshopWebFilter}
                onWebFilterChange={setEshopWebFilter}
                currency={currency}
                onCurrencyChange={setCurrency}
                targets={targets}
                onTargetsChange={setTargets}
                clientSlug={clientSlug}
              />
            )}
            {activeSection === "creative" && (
              <CreativeSection
                enabled={creativeEnabled}
                onEnabledChange={setCreativeEnabled}
              />
            )}
          </ScrollArea>

          {/* Footer */}
          <div className="border-t border-border px-6 py-4 flex items-center justify-between flex-shrink-0">
            {activeSection === "leadgen" && leadEnabled ? (
              <ValidateButton clientSlug={clientSlug} leadSources={leadSources} costUrls={costUrls} />
            ) : activeSection === "general" ? (
              deleteConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Opravdu odebrat klienta?</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? "Odebírám…" : "Ano, odebrat"}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDeleteConfirm(false)}>
                    Zrušit
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteConfirm(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Odebrat klienta
                </Button>
              )
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Zrušit</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-1.5">
                {saveMutation.isPending ? (
                  <><Spinner size="sm" /> Ukládám…</>
                ) : (
                  <><Save className="h-3.5 w-3.5" /> Uložit</>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Section: Obecné ── */

function GeneralSection({
  displayName,
  onDisplayNameChange,
  leadEnabled,
  ecommerceEnabled,
  creativeEnabled,
}: {
  displayName: string;
  onDisplayNameChange: (v: string) => void;
  leadEnabled: boolean;
  ecommerceEnabled: boolean;
  creativeEnabled: boolean;
}) {
  const modules = [
    { label: "LeadGen", enabled: leadEnabled, icon: BarChart3 },
    { label: "Ecommerce", enabled: ecommerceEnabled, icon: ShoppingCart },
    { label: "Creative Lab", enabled: creativeEnabled, icon: Sparkles },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Zobrazovaný název</Label>
        <Input
          value={displayName}
          onChange={(e) => onDisplayNameChange(e.target.value)}
          placeholder="Zobrazovaný název klienta"
          className="max-w-sm"
        />
        <p className="text-xs text-muted-foreground">Zobrazuje se v dashboardu a přehledu klientů.</p>
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-semibold">Aktivní moduly</Label>
        <div className="grid grid-cols-3 gap-3">
          {modules.map((m) => (
            <div
              key={m.label}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border px-3 py-3",
                m.enabled
                  ? "border-[#4f11ff]/20 bg-[#4f11ff]/5"
                  : "border-border bg-muted/20"
              )}
            >
              <m.icon className={cn("h-4 w-4 shrink-0", m.enabled ? "text-[#4f11ff]" : "text-muted-foreground/30")} />
              <span className={cn("text-sm font-medium", m.enabled ? "text-foreground" : "text-muted-foreground/40")}>
                {m.label}
              </span>
              <span
                className={cn(
                  "ml-auto h-2 w-2 rounded-full flex-shrink-0",
                  m.enabled ? "bg-[#b0f221]" : "bg-muted-foreground/20"
                )}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Moduly zapínáš v příslušných sekcích vlevo.</p>
      </div>
    </div>
  );
}

/* ── Section: LeadGen ── */

function LeadGenSection({
  enabled,
  onEnabledChange,
  leadSources,
  onLeadSourcesChange,
  costUrls,
  onCostUrlsChange,
  costWebFilter,
  onCostWebFilterChange,
  clientSlug,
  clientName,
}: {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  leadSources: { url: string; config: SourceConfig }[];
  onLeadSourcesChange: (v: { url: string; config: SourceConfig }[]) => void;
  costUrls: string[];
  onCostUrlsChange: (v: string[]) => void;
  costWebFilter: string;
  onCostWebFilterChange: (v: string) => void;
  clientSlug: string;
  clientName: string;
}) {
  return (
    <div className="space-y-5">
      {/* Module toggle header */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-5 w-5 text-[#4f11ff]" />
          <div>
            <p className="text-sm font-semibold">LeadGen</p>
            <p className="text-xs text-muted-foreground">Sběr poptávek, CRM, kvalifikace leadů</p>
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={onEnabledChange} />
      </div>

      {enabled && (
        <Tabs defaultValue="sources">
          <TabsList className="mb-4">
            <TabsTrigger value="sources">Zdroje leadů</TabsTrigger>
            <TabsTrigger value="costs">Náklady</TabsTrigger>
            <TabsTrigger value="appscript">AppScript / CRM</TabsTrigger>
          </TabsList>

          <TabsContent value="sources" className="space-y-6 mt-0">
            {leadSources.map((ls, idx) => (
              <LeadSourceBlock
                key={idx}
                index={idx}
                source={ls}
                total={leadSources.length}
                onChange={(updated) => {
                  const copy = [...leadSources];
                  copy[idx] = updated;
                  onLeadSourcesChange(copy);
                }}
                onRemove={() => onLeadSourcesChange(leadSources.filter((_, i) => i !== idx))}
              />
            ))}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => onLeadSourcesChange([...leadSources, { url: "", config: {} }])}
            >
              <Plus className="h-3.5 w-3.5" /> Přidat zdroj leadů
            </Button>
          </TabsContent>

          <TabsContent value="costs" className="space-y-6 mt-0">
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Google Sheets – Marketingové náklady</Label>
              {costUrls.map((url, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={url}
                    onChange={(e) => {
                      const c = [...costUrls];
                      c[i] = e.target.value;
                      onCostUrlsChange(c);
                    }}
                    placeholder="https://docs.google.com/spreadsheets/d/.../export?format=csv"
                    className="text-xs"
                  />
                  {costUrls.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => onCostUrlsChange(costUrls.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => onCostUrlsChange([...costUrls, ""])} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Přidat URL
              </Button>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Web filtr (volitelné)</Label>
              <Input
                value={costWebFilter}
                onChange={(e) => onCostWebFilterChange(e.target.value)}
                placeholder="např. neoflam.cz"
                className="max-w-xs"
              />
            </div>
            <CampaignFilter clientSlug={clientSlug} />
          </TabsContent>

          <TabsContent value="appscript" className="mt-0">
            <AppScriptTab
              clientName={clientName}
              leadSources={leadSources}
              onLeadSourcesChange={onLeadSourcesChange}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

/* ── Section: Ecommerce ── */

function EcommerceSection({
  enabled,
  onEnabledChange,
  sourceUrl,
  onSourceUrlChange,
  excludedCampaigns,
  onExcludedCampaignsChange,
  budgetMode,
  onBudgetModeChange,
  webFilter,
  onWebFilterChange,
  currency,
  onCurrencyChange,
  targets,
  onTargetsChange,
  clientSlug,
}: {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  sourceUrl: string;
  onSourceUrlChange: (v: string) => void;
  excludedCampaigns: string;
  onExcludedCampaignsChange: (v: string) => void;
  budgetMode: "total" | "per_channel";
  onBudgetModeChange: (v: "total" | "per_channel") => void;
  webFilter: string;
  onWebFilterChange: (v: string) => void;
  currency: "CZK" | "EUR";
  onCurrencyChange: (v: "CZK" | "EUR") => void;
  targets: BudgetTarget[];
  onTargetsChange: (v: BudgetTarget[]) => void;
  clientSlug: string;
}) {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const { data: availableChannels, isLoading: channelsLoading, refetch: refetchChannels } = useQuery<string[]>({
    queryKey: ["eshop-channels", clientSlug],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-eshop-config", {
        body: { action: "list_channels", client_slug: clientSlug },
      });
      if (error) throw error;
      return data;
    },
    enabled: enabled && budgetMode === "per_channel",
    staleTime: 60_000,
  });

  useEffect(() => {
    if (budgetMode === "per_channel" && availableChannels && availableChannels.length > 0) {
      const hasOnlyTotal = targets.length === 1 && targets[0].channel === "_total";
      if (hasOnlyTotal || targets.length === 0) {
        const existingMap = new Map(targets.filter((t) => t.channel !== "_total").map((t) => [t.channel, t.target_amount]));
        onTargetsChange(availableChannels.map((ch) => ({ channel: ch, target_amount: existingMap.get(ch) || 0 })));
      }
    }
    if (budgetMode === "total") {
      if (targets.some((t) => t.channel !== "_total") || targets.length === 0) {
        onTargetsChange([{ channel: "_total", target_amount: 0 }]);
      }
    }
  }, [budgetMode, availableChannels]);

  return (
    <div className="space-y-5">
      {/* Module toggle header */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-3">
          <ShoppingCart className="h-5 w-5 text-[#4f11ff]" />
          <div>
            <p className="text-sm font-semibold">Ecommerce</p>
            <p className="text-xs text-muted-foreground">Sledování rozpočtů reklamních kampaní</p>
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={onEnabledChange} />
      </div>

      {enabled && (
        <div className="space-y-5">
          {/* Source URL */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Google Sheet URL (náklady)</Label>
            <Input
              value={sourceUrl}
              onChange={(e) => onSourceUrlChange(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
            />
          </div>

          {/* Web filter */}
          <div className="space-y-2">
            <Label>Web filtr (nepovinné)</Label>
            <Input
              value={webFilter}
              onChange={(e) => onWebFilterChange(e.target.value)}
              placeholder="např. eshop.cz"
              className="max-w-xs"
            />
            <p className="text-xs text-muted-foreground">Filtruje data podle sloupce &apos;web&apos;</p>
          </div>

          {/* Campaign filter */}
          <EshopCampaignFilter
            clientSlug={clientSlug}
            excludedCampaigns={excludedCampaigns}
            onExcludedChange={onExcludedCampaignsChange}
          />

          {/* Currency */}
          <div className="space-y-2">
            <Label>Měna nákladů</Label>
            <Select value={currency} onValueChange={(v) => onCurrencyChange(v as "CZK" | "EUR")}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CZK">CZK (Kč)</SelectItem>
                <SelectItem value="EUR">EUR (€)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Budget mode */}
          <div className="space-y-2">
            <Label>Režim rozpočtu</Label>
            <Select value={budgetMode} onValueChange={(v) => onBudgetModeChange(v as "total" | "per_channel")}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="total">Celkový rozpočet</SelectItem>
                <SelectItem value="per_channel">Každý kanál zvlášť</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Budget targets */}
          <div className="space-y-3">
            {budgetMode === "per_channel" && (
              <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                Kanály se načítají automaticky z dat. Zkontrolujte, zda odpovídají aktivně spravovaným kanálům.
              </p>
            )}
            <div className="flex items-center justify-between">
              <Label>Cílový rozpočet ({currentMonth}/{currentYear})</Label>
              {budgetMode === "per_channel" && (
                <div className="flex items-center gap-1">
                  {channelsLoading && <Spinner size="sm" />}
                  <Button variant="ghost" size="sm" onClick={() => onTargetsChange([...targets, { channel: "", target_amount: 0 }])} className="gap-1 h-7 text-xs">
                    <Plus className="h-3 w-3" /> Přidat kanál
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => refetchChannels()} className="h-7 text-xs" title="Načíst kanály z dat">
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
            {targets.map((target, idx) => (
              <div key={idx} className="flex items-center gap-2">
                {budgetMode === "per_channel" ? (
                  <Input
                    value={target.channel === "_total" ? "" : target.channel}
                    onChange={(e) => onTargetsChange(targets.map((t, i) => i === idx ? { ...t, channel: e.target.value.toLowerCase() } : t))}
                    placeholder="google, meta, sklik…"
                    className="flex-1"
                  />
                ) : (
                  <span className="text-sm text-muted-foreground flex-1">Celkem</span>
                )}
                <Input
                  type="number"
                  value={target.target_amount || ""}
                  onChange={(e) => onTargetsChange(targets.map((t, i) => i === idx ? { ...t, target_amount: parseFloat(e.target.value) || 0 } : t))}
                  placeholder="0"
                  className="w-32"
                />
                <span className="text-xs text-muted-foreground">{currency === "EUR" ? "€" : "Kč"}</span>
                {budgetMode === "per_channel" && targets.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onTargetsChange(targets.filter((_, i) => i !== idx))}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Section: Creative Lab ── */

function CreativeSection({
  enabled,
  onEnabledChange,
}: {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-[#4f11ff]" />
          <div>
            <p className="text-sm font-semibold">Creative Lab</p>
            <p className="text-xs text-muted-foreground">Brand DNA, kreativní briefingy, analýza konkurence</p>
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={onEnabledChange} />
      </div>

      {enabled ? (
        <div className="rounded-xl border border-[#4f11ff]/15 bg-[#4f11ff]/5 p-4 space-y-2">
          <p className="text-sm font-medium text-[#4f11ff]">Creative Lab je aktivní</p>
          <p className="text-xs text-muted-foreground">
            Správa kreativních podkladů probíhá v sekci Creative Lab. Tam nastavíš Brand DNA,
            spravuješ briefingy a analyzuješ konkurenci.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-6 text-center space-y-2">
          <Sparkles className="h-8 w-8 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">Creative Lab není pro tohoto klienta zapnutý.</p>
          <p className="text-xs text-muted-foreground/70">Zapni přepínač výše a ulož nastavení.</p>
        </div>
      )}
    </div>
  );
}

/* ── Lead Source Block ── */

function LeadSourceBlock({
  index,
  source,
  total,
  onChange,
  onRemove,
}: {
  index: number;
  source: { url: string; config: SourceConfig };
  total: number;
  onChange: (s: { url: string; config: SourceConfig }) => void;
  onRemove: () => void;
}) {
  const cols = source.config.columns || {};
  const qual = source.config.qualification || { qualified_values: [], not_qualified_values: [] };
  const customCols: CustomCol[] = (source.config.custom_columns || []).map((c, i) => ({
    id: `cc-${i}`,
    name: c.name,
    column: indexToColLetter(c.column),
    icon: c.icon,
  }));

  const [qualValues, setQualValues] = useState<QualValue[]>(() => {
    const qv: QualValue[] = [];
    for (const v of qual.qualified_values || []) qv.push({ value: v, isQualified: true });
    for (const v of qual.not_qualified_values || []) qv.push({ value: v, isQualified: false });
    if (qv.length === 0) qv.push({ value: "ano", isQualified: true }, { value: "ne", isQualified: false });
    return qv;
  });

  const [custCols, setCustCols] = useState<CustomCol[]>(customCols.length > 0 ? customCols : []);
  const [nameSplit, setNameSplit] = useState(!!source.config.name_split);
  const rawDefault = source.config.default_qualified;
  const [defaultQual, setDefaultQual] = useState(
    rawDefault === "" || rawDefault === "__unprocessed__" ? "__unprocessed__" : (rawDefault as string) || "ne"
  );
  const [sourceName, setSourceName] = useState(source.config.source_name || "");

  const getCol = (key: string) => indexToColLetter(cols[key] ?? -1);
  const [colSubmissionId, setColSubmissionId] = useState(getCol("submissionId") || "A");
  const [colDate, setColDate] = useState(getCol("date") || "B");
  const [colFirstName, setColFirstName] = useState(getCol("firstName") || "C");
  const [colLastName, setColLastName] = useState(getCol("lastName") || "");
  const [colPhone, setColPhone] = useState(getCol("phone") || "D");
  const [colEmail, setColEmail] = useState(getCol("email") || "");
  const [colCompany, setColCompany] = useState(getCol("company") || "");
  const [colQualified, setColQualified] = useState(getCol("qualified") || "E");

  const syncUp = useCallback(() => {
    const newCols: Record<string, number> = {
      submissionId: colLetterToIndex(colSubmissionId),
      date: colLetterToIndex(colDate),
      firstName: colLetterToIndex(colFirstName),
      phone: colLetterToIndex(colPhone),
      qualified: colLetterToIndex(colQualified),
    };
    if (nameSplit && colLastName) newCols.lastName = colLetterToIndex(colLastName);
    if (colEmail) newCols.email = colLetterToIndex(colEmail);
    if (colCompany) newCols.company = colLetterToIndex(colCompany);

    const newQual = {
      qualified_values: qualValues.filter((q) => q.isQualified).map((q) => q.value),
      not_qualified_values: qualValues.filter((q) => !q.isQualified).map((q) => q.value),
    };

    const newCustom = custCols
      .filter((c) => c.name.trim() && c.column.trim())
      .map((c) => ({ name: c.name, column: colLetterToIndex(c.column), icon: c.icon || undefined }));

    onChange({
      url: source.url,
      config: {
        ...source.config,
        columns: newCols,
        name_split: nameSplit || undefined,
        default_qualified: defaultQual === "__unprocessed__" ? "" : defaultQual,
        qualification: newQual,
        custom_columns: newCustom.length > 0 ? newCustom : undefined,
        source_name: sourceName || undefined,
      },
    });
  }, [colSubmissionId, colDate, colFirstName, colLastName, colPhone, colEmail, colCompany, colQualified, nameSplit, qualValues, custCols, defaultQual, sourceName, source.url]);

  useEffect(() => { syncUp(); }, [syncUp]);

  return (
    <div className="border border-border rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Zdroj leadů #{index + 1}</Label>
        {total > 1 && (
          <Button variant="ghost" size="sm" onClick={onRemove} className="h-7 text-destructive hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Odebrat
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Název zdroje</Label>
          <Input value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="např. Google, Facebook, Seznam…" className="text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">URL Google Sheetu</Label>
          <Input value={source.url} onChange={(e) => onChange({ ...source, url: e.target.value })} placeholder="https://docs.google.com/spreadsheets/d/.../export?format=csv" className="text-xs" />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">Mapování sloupců (písmeno A, B, C…)</p>

      <div className="grid grid-cols-3 gap-2">
        <ColInput label="ID záznamu" value={colSubmissionId} onChange={setColSubmissionId} />
        <ColInput label="Datum" value={colDate} onChange={setColDate} />
        <ColInput label={nameSplit ? "Jméno" : "Jméno (celé)"} value={colFirstName} onChange={setColFirstName} />
        {nameSplit && <ColInput label="Příjmení" value={colLastName} onChange={setColLastName} />}
        <ColInput label="Telefon" value={colPhone} onChange={setColPhone} />
        <ColInput label="Email" value={colEmail} onChange={setColEmail} />
        <ColInput label="Firma" value={colCompany} onChange={setColCompany} />
        <ColInput label="Kvalifikace" value={colQualified} onChange={setColQualified} />
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-semibold">Vlastní sloupce (propíší se do CRM)</Label>
        {custCols.map((cc, i) => {
          const SelectedIcon = getCustomColIcon(cc.icon);
          return (
            <div key={cc.id} className="flex items-center gap-2">
              <Select value={cc.icon || "__none__"} onValueChange={(v) => { const copy = [...custCols]; copy[i] = { ...copy[i], icon: v === "__none__" ? undefined : v }; setCustCols(copy); }}>
                <SelectTrigger className="h-8 w-12 px-2 shrink-0">
                  {SelectedIcon ? <SelectedIcon className="h-3.5 w-3.5 text-muted-foreground" /> : <Hash className="h-3.5 w-3.5 text-muted-foreground/40" />}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__"><span className="text-xs text-muted-foreground">Žádná</span></SelectItem>
                  {CUSTOM_COL_ICONS.map((ico) => (
                    <SelectItem key={ico.value} value={ico.value}>
                      <span className="flex items-center gap-2"><ico.icon className="h-3.5 w-3.5" /><span className="text-xs">{ico.label}</span></span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input value={cc.name} onChange={(e) => { const copy = [...custCols]; copy[i] = { ...copy[i], name: e.target.value }; setCustCols(copy); }} placeholder="Název (např. Počet aut)" className="h-8 flex-1 text-sm" />
              <Input value={cc.column} onChange={(e) => { const copy = [...custCols]; copy[i] = { ...copy[i], column: e.target.value.toUpperCase() }; setCustCols(copy); }} placeholder="F" className="h-8 w-16 uppercase font-mono text-sm shrink-0" maxLength={2} />
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setCustCols(custCols.filter((_, j) => j !== i))}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          );
        })}
        <Button variant="outline" size="sm" onClick={() => setCustCols([...custCols, { id: crypto.randomUUID(), name: "", column: "" }])} className="gap-1.5 text-xs">
          <Plus className="h-3 w-3" /> Přidat sloupec
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Switch checked={nameSplit} onCheckedChange={setNameSplit} />
        <Label className="text-xs">Oddělené jméno/příjmení</Label>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-semibold">Hodnoty kvalifikace</Label>
        {qualValues.map((qv, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input value={qv.value} onChange={(e) => { const copy = [...qualValues]; copy[i] = { ...copy[i], value: e.target.value }; setQualValues(copy); }} placeholder="hodnota" className="h-8 flex-1 text-sm" />
            <Select value={qv.isQualified ? "yes" : "no"} onValueChange={(v) => { const copy = [...qualValues]; copy[i] = { ...copy[i], isQualified: v === "yes" }; setQualValues(copy); }}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="yes"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500" />Kvalifikovaný</span></SelectItem>
                <SelectItem value="no"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-destructive" />Nekvalifikovaný</span></SelectItem>
              </SelectContent>
            </Select>
            {qualValues.length > 1 && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setQualValues(qualValues.filter((_, j) => j !== i))}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            )}
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setQualValues([...qualValues, { value: "", isQualified: false }])} className="gap-1.5 text-xs">
          <Plus className="h-3 w-3" /> Přidat hodnotu
        </Button>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Výchozí stav kvalifikace</Label>
        <p className="text-xs text-muted-foreground">Co znamená prázdný řádek v sheetu</p>
        <Select value={defaultQual} onValueChange={setDefaultQual}>
          <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ano"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500" />Kvalifikovaný</span></SelectItem>
            <SelectItem value="ne"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-destructive" />Nekvalifikovaný</span></SelectItem>
            <SelectItem value="__unprocessed__"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-orange-400" />Nezpracovaný</span></SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/* ── Campaign Filter (LeadGen) ── */

interface Campaign { name: string; isLead: boolean }

function CampaignFilter({ clientSlug }: { clientSlug: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ["lead-campaigns", clientSlug],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-lead-campaigns", {
        body: { client_slug: clientSlug, action: "list" },
      });
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 5,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ campaignName, isLead }: { campaignName: string; isLead: boolean }) => {
      const { error } = await supabase.functions.invoke("manage-lead-campaigns", {
        body: { client_slug: clientSlug, action: isLead ? "add" : "remove", campaign_name: campaignName },
      });
      if (error) throw error;
      return { campaignName, isLead };
    },
    onSuccess: ({ campaignName, isLead }) => {
      queryClient.setQueryData<Campaign[]>(["lead-campaigns", clientSlug], (old) =>
        old?.map((c) => c.name === campaignName ? { ...c, isLead } : c) ?? []
      );
      queryClient.invalidateQueries({ queryKey: ["marketing-costs", clientSlug] });
    },
    onError: () => { toast({ variant: "destructive", description: "Chyba při ukládání" }); },
  });

  const selectedCount = campaigns?.filter((c) => c.isLead).length ?? 0;
  const totalCount = campaigns?.length ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Label className="text-sm font-semibold">Filtr kampaní pro leadgen</Label>
      </div>
      <p className="text-xs text-muted-foreground">
        Vyberte kampaně, jejichž náklady se mají započítat do dashboardu.
        {selectedCount === 0 && totalCount > 0 && <span className="block mt-0.5 text-muted-foreground/70">Pokud žádná není vybrána, počítají se náklady ze všech.</span>}
      </p>
      {isLoading ? (
        <div className="flex items-center gap-2 py-4"><Spinner size="sm" /><span className="text-xs text-muted-foreground">Načítám kampaně…</span></div>
      ) : !campaigns || campaigns.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center">
          <p className="text-xs text-muted-foreground">Žádné kampaně nalezeny v datech</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border max-h-[200px] overflow-y-auto">
          <div className="px-3 py-2 bg-muted/30 flex items-center justify-between sticky top-0">
            <span className="text-xs text-muted-foreground">{selectedCount} z {totalCount} vybráno</span>
          </div>
          {campaigns.map((campaign) => (
            <label key={campaign.name} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30 transition-colors cursor-pointer">
              <Checkbox checked={campaign.isLead} disabled={toggleMutation.isPending} onCheckedChange={(checked) => { toggleMutation.mutate({ campaignName: campaign.name, isLead: !!checked }); }} />
              <span className="text-xs truncate flex-1">{campaign.name}</span>
              {toggleMutation.isPending && toggleMutation.variables?.campaignName === campaign.name && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Eshop Campaign Filter ── */

interface EshopCampaignItem { name: string; included: boolean }

function EshopCampaignFilter({
  clientSlug,
  excludedCampaigns,
  onExcludedChange,
}: {
  clientSlug: string;
  excludedCampaigns: string;
  onExcludedChange: (val: string) => void;
}) {
  const { data: campaigns, isLoading } = useQuery<EshopCampaignItem[]>({
    queryKey: ["eshop-campaigns", clientSlug],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-eshop-config", {
        body: { action: "list_campaigns", client_slug: clientSlug },
      });
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });

  const excludedSet = new Set(
    excludedCampaigns.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
  );

  const toggleCampaign = (name: string, included: boolean) => {
    const newExcluded = new Set(excludedSet);
    if (included) newExcluded.delete(name.toLowerCase());
    else newExcluded.add(name.toLowerCase());
    onExcludedChange(Array.from(newExcluded).join(", "));
  };

  const totalCount = campaigns?.length ?? 0;
  const includedCount = campaigns?.filter((c) => !excludedSet.has(c.name.toLowerCase())).length ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Label className="text-sm font-semibold">Filtr kampaní</Label>
      </div>
      <p className="text-xs text-muted-foreground">Odškrtněte kampaně, které chcete vyloučit z výpočtu rozpočtu.</p>
      {isLoading ? (
        <div className="flex items-center gap-2 py-4"><Spinner size="sm" /><span className="text-xs text-muted-foreground">Načítám kampaně…</span></div>
      ) : !campaigns || campaigns.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center">
          <p className="text-xs text-muted-foreground">Žádné kampaně nalezeny. Nejdřív nastavte Google Sheet URL a uložte.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border max-h-[200px] overflow-y-auto">
          <div className="px-3 py-2 bg-muted/30 sticky top-0">
            <span className="text-xs text-muted-foreground">{includedCount} z {totalCount} zahrnuto</span>
          </div>
          {campaigns.map((campaign) => {
            const isIncluded = !excludedSet.has(campaign.name.toLowerCase());
            return (
              <label key={campaign.name} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30 transition-colors cursor-pointer">
                <Checkbox checked={isIncluded} onCheckedChange={(checked) => toggleCampaign(campaign.name, !!checked)} />
                <span className="text-xs truncate flex-1">{campaign.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Validate Button ── */

interface ValidationResult { original: string; normalized: string; ok: boolean; error?: string }

function ValidateButton({
  clientSlug,
  leadSources,
  costUrls,
}: {
  clientSlug: string;
  leadSources: { url: string; config: SourceConfig }[];
  costUrls: string[];
}) {
  const [validating, setValidating] = useState(false);
  const [results, setResults] = useState<ValidationResult[] | null>(null);

  const handleValidate = async () => {
    const allUrls = [...leadSources.map((ls) => ls.url).filter((u) => u.trim()), ...costUrls.filter((u) => u.trim())];
    if (allUrls.length === 0) return;
    setValidating(true);
    setResults(null);
    try {
      const { data, error } = await supabase.functions.invoke("manage-client-config", {
        body: { action: "validate", client_slug: clientSlug, urls: allUrls },
      });
      if (error) throw error;
      setResults(data as ValidationResult[]);
    } catch {
      setResults([{ original: "", normalized: "", ok: false, error: "Chyba při validaci" }]);
    } finally {
      setValidating(false);
    }
  };

  const allOk = results && results.every((r) => r.ok);

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={handleValidate} disabled={validating} className="gap-1.5 text-xs">
        {validating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
        {validating ? "Ověřuji…" : "Ověřit URL"}
      </Button>
      {results && (
        <div className="flex items-center gap-1.5 text-xs">
          {allOk ? (
            <><CheckCircle2 className="h-3.5 w-3.5 text-green-600" /><span className="text-green-600">Všechny URL jsou dostupné</span></>
          ) : (
            <div className="flex flex-col gap-0.5">
              {results.filter((r) => !r.ok).map((r, i) => (
                <div key={i} className="flex items-center gap-1.5 text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate max-w-[250px]">{r.error}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Column input helper ── */

function ColInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-8 uppercase font-mono text-sm" maxLength={2} />
    </div>
  );
}

/* ── AppScript Tab ── */

function AppScriptTab({
  clientName,
  leadSources,
  onLeadSourcesChange,
}: {
  clientName: string;
  leadSources: { url: string; config: SourceConfig }[];
  onLeadSourcesChange: (sources: { url: string; config: SourceConfig }[]) => void;
}) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const activeSources = leadSources.filter((s) => s.url.trim());

  const copyScript = (script: string, idx: number) => {
    navigator.clipboard.writeText(script);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const updateWritebackUrl = (sourceIdx: number, url: string) => {
    let activeCount = -1;
    for (let i = 0; i < leadSources.length; i++) {
      if (leadSources[i].url.trim()) activeCount++;
      if (activeCount === sourceIdx) {
        const copy = [...leadSources];
        copy[i] = { ...copy[i], config: { ...copy[i].config, writeback_url: url } };
        onLeadSourcesChange(copy);
        return;
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3 border border-border rounded-xl p-4 bg-muted/30">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <Label className="text-sm font-semibold">Návod na nasazení Apps Scriptu</Label>
        </div>
        <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
          <li>Otevřete Google Sheet s poptávkami klienta <strong>{clientName}</strong>.</li>
          <li>Přejděte na <strong>Rozšíření → Apps Script</strong>.</li>
          <li>Smažte veškerý stávající kód a vložte skript níže.</li>
          <li>Klikněte na <strong>Nasadit → Nové nasazení</strong>.</li>
          <li>Typ: <strong>Webová aplikace</strong>. Přístup: <strong>Kdokoli</strong>. Potvrďte oprávnění.</li>
          <li>Zkopírujte vygenerovanou URL a vložte ji do pole níže.</li>
          <li>Při aktualizaci skriptu: <strong>Nasadit → Spravovat nasazení → Upravit → Nová verze</strong>.</li>
        </ol>
      </div>

      {activeSources.map((source, idx) => {
        const sourceName = (source.config?.source_name as string) || `Zdroj ${idx + 1}`;
        const cols = source.config?.columns || {};
        const nameSplit = source.config?.name_split;
        const customCols = source.config?.custom_columns || [];
        const script = generateAppScript({ clientName, cols, nameSplit, customCols, sourceName });
        const isCopied = copiedIdx === idx;
        const wbUrl = (source.config?.writeback_url as string) || "";

        return (
          <div key={idx} className="space-y-3 border border-border rounded-xl p-4">
            <Label className="text-sm font-semibold">
              {activeSources.length > 1 ? sourceName : `AppScript — ${clientName}`}
            </Label>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">URL nasazeného Apps Scriptu</Label>
              <Input value={wbUrl} onChange={(e) => updateWritebackUrl(idx, e.target.value)} placeholder="https://script.google.com/macros/s/.../exec" className="text-xs" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Vygenerovaný skript</Label>
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => copyScript(script, idx)}>
                  {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {isCopied ? "Zkopírováno" : "Kopírovat"}
                </Button>
              </div>
              <pre className="text-[11px] leading-relaxed bg-foreground/5 border border-border rounded-lg p-4 overflow-x-auto whitespace-pre font-mono max-h-[250px] overflow-y-auto">
                {script}
              </pre>
            </div>
          </div>
        );
      })}

      {activeSources.length === 0 && (
        <p className="text-sm text-muted-foreground italic">Nejprve přidejte alespoň jeden zdroj leadů pro vygenerování skriptu.</p>
      )}
    </div>
  );
}

/* ── Script generator ── */

function generateAppScript({
  clientName,
  cols,
  nameSplit,
  customCols,
  sourceName,
}: {
  clientName: string;
  cols: Record<string, number>;
  nameSplit?: boolean;
  customCols?: { name: string; column: number }[];
  sourceName?: string;
}) {
  const submissionIdCol = (cols.submissionId ?? 0) + 1;
  const qualifiedCol = (cols.qualified ?? 4) + 1;

  const extraFields: string[] = [];
  if (customCols && customCols.length > 0) {
    for (const cc of customCols) {
      extraFields.push(`      "${cc.name}": row[${cc.column + 1}] || ""`);
    }
  }

  const nameReadCode = nameSplit
    ? `      "name": (row[${(cols.firstName ?? 2) + 1}] || "") + " " + (row[${(cols.lastName ?? 3) + 1}] || "")`
    : `      "name": row[${(cols.firstName ?? 2) + 1}] || ""`;

  const phoneCol = (cols.phone ?? 3) + 1;
  const scriptLabel = sourceName ? `${clientName} — ${sourceName}` : clientName;

  return `/**
 * Apps Script — CRM Writeback pro ${scriptLabel}
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var submissionId = data.${WRITEBACK_FIELDS.submissionId};
    var status = data.${WRITEBACK_FIELDS.status};

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var dataRange = sheet.getDataRange();
    var values = dataRange.getValues();

    var submissionIdCol = ${submissionIdCol};
    var qualifiedCol = ${qualifiedCol};

    var found = false;
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][submissionIdCol - 1]) === String(submissionId)) {
        var qualValue = status === "${WRITEBACK_STATUS.relevant}" ? "ano" : status === "${WRITEBACK_STATUS.unreviewed}" ? "" : "ne";
        sheet.getRange(i + 1, qualifiedCol).setValue(qualValue);
        found = true;
        break;
      }
    }

    return ContentService.createTextOutput(
      JSON.stringify({ success: found, ${WRITEBACK_FIELDS.submissionId}: submissionId })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var dataRange = sheet.getDataRange();
    var values = dataRange.getValues();

    var results = [];
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      results.push({
      "submission_id": row[${submissionIdCol - 1}] || "",
${nameReadCode},
      "phone": row[${phoneCol - 1}] || "",
      "qualified": row[${qualifiedCol - 1}] || ""${extraFields.length > 0 ? ",\n" + extraFields.join(",\n") : ""}
      });
    }

    return ContentService.createTextOutput(
      JSON.stringify(results)
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}`;
}
