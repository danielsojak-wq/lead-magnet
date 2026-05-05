import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEshopConfig } from "@/hooks/useEshopBudget";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Settings2, Plus, Trash2, Filter, RefreshCw } from "lucide-react";

interface BudgetTarget {
  channel: string;
  target_amount: number;
}

export function EcommerceSettings({ clientSlug, autoOpen, onAutoClose, children }: { clientSlug: string; autoOpen?: boolean; onAutoClose?: () => void; children?: React.ReactNode }) {
  const [open, setOpen] = useState(autoOpen || false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useEshopConfig(open ? clientSlug : null);

  const handleOpenChange = (val: boolean) => {
    setOpen(val);
    if (!val && onAutoClose) onAutoClose();
  };
  const [sourceUrl, setSourceUrl] = useState("");
  const [excludedCampaigns, setExcludedCampaigns] = useState("");
  const [budgetMode, setBudgetMode] = useState<"total" | "per_channel">("total");
  const [webFilter, setWebFilter] = useState("");
  const [currency, setCurrency] = useState<"CZK" | "EUR">("CZK");
  const [targets, setTargets] = useState<BudgetTarget[]>([{ channel: "_total", target_amount: 0 }]);
  const [saving, setSaving] = useState(false);

  // Fetch available channels for this client
  const { data: availableChannels, isLoading: channelsLoading, refetch: refetchChannels } = useQuery<string[]>({
    queryKey: ["eshop-channels", clientSlug],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-eshop-config", {
        body: { action: "list_channels", client_slug: clientSlug },
      });
      if (error) throw error;
      return data;
    },
    enabled: open && budgetMode === "per_channel",
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!config) return;
    setSourceUrl(config.source?.source_urls?.[0] || "");
    const cfg = config.source?.config || {};
    setExcludedCampaigns((cfg.excluded_campaigns as string) || "");
    setBudgetMode((cfg.budget_mode as "total" | "per_channel") || "total");
    setWebFilter((cfg.web_filter as string) || "");
    setCurrency((cfg.currency as "CZK" | "EUR") || "CZK");
    if (config.targets.length > 0) {
      setTargets(config.targets.map((t) => ({ channel: t.channel, target_amount: Number(t.target_amount) })));
    } else {
      setTargets([{ channel: "_total", target_amount: 0 }]);
    }
  }, [config]);

  // When switching to per_channel mode, auto-populate with available channels
  useEffect(() => {
    if (budgetMode === "per_channel" && availableChannels && availableChannels.length > 0) {
      // Only auto-populate if we have a single _total target or empty targets
      const hasOnlyTotal = targets.length === 1 && targets[0].channel === "_total";
      const hasNoTargets = targets.length === 0;
      if (hasOnlyTotal || hasNoTargets) {
        const existingMap = new Map(targets.filter(t => t.channel !== "_total").map(t => [t.channel, t.target_amount]));
        setTargets(availableChannels.map(ch => ({
          channel: ch,
          target_amount: existingMap.get(ch) || 0,
        })));
      }
    }
    if (budgetMode === "total") {
      const hasNonTotal = targets.some(t => t.channel !== "_total");
      if (hasNonTotal || targets.length === 0) {
        setTargets([{ channel: "_total", target_amount: 0 }]);
      }
    }
  }, [budgetMode, availableChannels]);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke("manage-eshop-config", {
        body: {
          action: "update",
          client_slug: clientSlug,
          source_url: sourceUrl,
          excluded_campaigns: excludedCampaigns,
          budget_mode: budgetMode,
          web_filter: webFilter,
          currency,
          budget_targets: targets,
          month: currentMonth,
          year: currentYear,
        },
      });
      if (error) throw error;
      toast({ description: "Nastavení uloženo" });
      queryClient.invalidateQueries({ queryKey: ["eshop-budget", clientSlug] });
      queryClient.invalidateQueries({ queryKey: ["eshop-config", clientSlug] });
      queryClient.invalidateQueries({ queryKey: ["eshop-client-list"] });
      queryClient.invalidateQueries({ queryKey: ["eshop-configured-clients"] });
      handleOpenChange(false);
    } catch (err: any) {
      toast({ variant: "destructive", description: err.message || "Chyba při ukládání" });
    } finally {
      setSaving(false);
    }
  };

  const addTarget = () => {
    setTargets([...targets, { channel: "", target_amount: 0 }]);
  };

  const removeTarget = (idx: number) => {
    setTargets(targets.filter((_, i) => i !== idx));
  };

  const updateTarget = (idx: number, field: keyof BudgetTarget, value: string | number) => {
    setTargets(targets.map((t, i) => (i === idx ? { ...t, [field]: value } : t)));
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm" className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />
            Nastavení
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>E-shop nastavení</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4">Načítám…</p>
        ) : (
          <div className="space-y-5">
            {/* Source URL */}
            <div className="space-y-2">
              <Label>Google Sheet URL (náklady)</Label>
              <Input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
              />
            </div>

            {/* Web filter */}
            <div className="space-y-2">
              <Label>Web filtr (nepovinné)</Label>
              <Input
                value={webFilter}
                onChange={(e) => setWebFilter(e.target.value)}
                placeholder="např. eshop.cz"
              />
              <p className="text-xs text-muted-foreground">Filtruje data podle sloupce 'web'</p>
            </div>

            {/* Campaign filter */}
            <EshopCampaignFilter
              clientSlug={clientSlug}
              excludedCampaigns={excludedCampaigns}
              onExcludedChange={setExcludedCampaigns}
            />

            {/* Currency */}
            <div className="space-y-2">
              <Label>Měna nákladů</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as "CZK" | "EUR")}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CZK">CZK (Kč)</SelectItem>
                  <SelectItem value="EUR">EUR (€)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Budget mode */}
            <div className="space-y-2">
              <Label>Režim rozpočtu</Label>
              <Select value={budgetMode} onValueChange={(v) => setBudgetMode(v as "total" | "per_channel")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="total">Celkový rozpočet</SelectItem>
                  <SelectItem value="per_channel">Každý kanál zvlášť</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Budget targets */}
            <div className="space-y-3">
              {budgetMode === "per_channel" && (
                <p className="text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
                  Kanály se načítají automaticky z vašich dat. Zkontrolujte, zda odpovídají kanálům, které u tohoto klienta aktivně spravujete.
                </p>
              )}
              <div className="flex items-center justify-between">
                <Label>Cílový rozpočet ({currentMonth}/{currentYear})</Label>
                {budgetMode === "per_channel" && (
                  <div className="flex items-center gap-1">
                    {channelsLoading && <Spinner size="sm" />}
                    <Button variant="ghost" size="sm" onClick={addTarget} className="gap-1 h-7 text-xs">
                      <Plus className="h-3 w-3" /> Přidat kanál
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => refetchChannels()} className="gap-1 h-7 text-xs" title="Načíst kanály z dat">
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
                      onChange={(e) => updateTarget(idx, "channel", e.target.value.toLowerCase())}
                      placeholder="google, meta, sklik…"
                      className="flex-1"
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground flex-1">Celkem</span>
                  )}
                  <Input
                    type="number"
                    value={target.target_amount || ""}
                    onChange={(e) => updateTarget(idx, "target_amount", parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-32"
                  />
                  <span className="text-xs text-muted-foreground">{currency === "EUR" ? "€" : "Kč"}</span>
                  {budgetMode === "per_channel" && targets.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeTarget(idx)}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Save */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Zrušit</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Ukládám…" : "Uložit"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface CampaignItem {
  name: string;
  included: boolean;
}

function EshopCampaignFilter({
  clientSlug,
  excludedCampaigns,
  onExcludedChange,
}: {
  clientSlug: string;
  excludedCampaigns: string;
  onExcludedChange: (val: string) => void;
}) {
  const { data: campaigns, isLoading } = useQuery<CampaignItem[]>({
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

  // Parse current excluded list
  const excludedSet = new Set(
    excludedCampaigns.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
  );

  const toggleCampaign = (name: string, included: boolean) => {
    const newExcluded = new Set(excludedSet);
    if (included) {
      newExcluded.delete(name.toLowerCase());
    } else {
      newExcluded.add(name.toLowerCase());
    }
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
      <p className="text-xs text-muted-foreground">
        Odškrtněte kampaně, které chcete vyloučit z výpočtu rozpočtu (např. Lead Gen kampaně).
      </p>

      {isLoading ? (
        <div className="flex items-center gap-2 py-4">
          <Spinner size="sm" />
          <span className="text-xs text-muted-foreground">Načítám kampaně…</span>
        </div>
      ) : !campaigns || campaigns.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center">
          <p className="text-xs text-muted-foreground">Žádné kampaně nalezeny v datech. Nejdřív nastavte Google Sheet URL a uložte.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border max-h-[200px] overflow-y-auto">
          <div className="px-3 py-2 bg-muted/30 flex items-center justify-between sticky top-0">
            <span className="text-xs text-muted-foreground">{includedCount} z {totalCount} zahrnuto</span>
          </div>
          {campaigns.map((campaign) => {
            const isIncluded = !excludedSet.has(campaign.name.toLowerCase());
            return (
              <label
                key={campaign.name}
                className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30 transition-colors cursor-pointer"
              >
                <Checkbox
                  checked={isIncluded}
                  onCheckedChange={(checked) => toggleCampaign(campaign.name, !!checked)}
                />
                <span className="text-xs truncate flex-1">{campaign.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
