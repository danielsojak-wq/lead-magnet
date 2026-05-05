import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Bell, Plus, Trash2, Loader2, ChevronDown, Hash, Mail, AlertTriangle, XCircle, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Frequency = "once" | "daily" | "3days" | "5days" | "weekly";

interface Rule {
  id?: string;
  rule_type: "no_lead_days" | "ads_inactive";
  params: { days?: number; message?: string };
  delivery: { type: "channel" | "dm"; channel?: string; slack_email?: string };
  frequency: Frequency;
  enabled: boolean;
}

const FREQUENCY_LABELS: Record<Frequency, string> = {
  once: "Jednorázově",
  daily: "1× denně",
  "3days": "1× za 3 dny",
  "5days": "1× za 5 dní",
  weekly: "1× týdně",
};

interface Props {
  clientSlug: string;
  clientName: string;
  userType: "admin" | "am";
  userId: string;
  userDisplayName?: string;
}

const RULE_LABELS: Record<string, { label: string; icon: typeof AlertTriangle; color: string }> = {
  no_lead_days: { label: "Žádná poptávka", icon: AlertTriangle, color: "text-amber-500" },
  ads_inactive: { label: "Reklamy neaktivní", icon: XCircle, color: "text-red-500" },
};

function RuleSummary({ rule }: { rule: Rule }) {
  const info = RULE_LABELS[rule.rule_type] || RULE_LABELS.no_lead_days;
  const Icon = info.icon;
  const deliveryLabel = rule.delivery.type === "channel"
    ? `#${(rule.delivery.channel || "").replace(/^#/, "")}`
    : rule.delivery.slack_email || "DM";

  return (
    <div className="flex items-center gap-2 min-w-0">
      <Icon className={`h-3.5 w-3.5 shrink-0 ${info.color}`} />
      <span className="text-sm font-medium truncate">
        {info.label}
        {rule.rule_type === "no_lead_days" && rule.params.days ? ` (${rule.params.days}d)` : ""}
      </span>
      <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
        {FREQUENCY_LABELS[rule.frequency] || "Jednorázově"}
      </Badge>
      <span className="text-muted-foreground text-xs">→</span>
      <span className="text-xs text-muted-foreground truncate flex items-center gap-1">
        {rule.delivery.type === "channel" ? <Hash className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
        {deliveryLabel}
      </span>
    </div>
  );
}

export function NotificationSettingsDialog({ clientSlug, clientName, userType, userId, userDisplayName }: Props) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const { data: rules, isLoading } = useQuery({
    queryKey: ["notification-rules", clientSlug, userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_rules" as any)
        .select("*")
        .eq("client_slug", clientSlug)
        .eq("user_id", userId);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: open,
  });

  const [localRules, setLocalRules] = useState<Rule[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<number, string>>({});
  const [isValidating, setIsValidating] = useState(false);

  if (rules && !initialized) {
    setLocalRules(rules.map((r: any) => ({
      id: r.id,
      rule_type: r.rule_type,
      params: r.params || {},
      delivery: r.delivery || { type: "channel", channel: "#client-alerts" },
      frequency: r.frequency || "once",
      enabled: r.enabled,
    })));
    setInitialized(true);
  }

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setInitialized(false);
      setValidationErrors({});
      setEditingIdx(null);
    }
  };

  const validateRules = async (): Promise<boolean> => {
    const errors: Record<number, string> = {};
    setValidationErrors({});
    setIsValidating(true);

    try {
      const enabledRules = localRules
        .map((r, idx) => ({ rule: r, idx }))
        .filter(({ rule }) => rule.enabled);

      const results = await Promise.all(
        enabledRules.map(async ({ rule, idx }) => {
          const { data, error } = await supabase.functions.invoke("validate-slack-target", {
            body: {
              type: rule.delivery.type,
              channel: rule.delivery.channel,
              slack_email: rule.delivery.slack_email,
            },
          });

          if (error) {
            return { idx, error: "Nepodařilo se ověřit Slack cíl" };
          }
          if (!data.valid) {
            return { idx, error: data.error || "Neplatný Slack cíl" };
          }
          return { idx, error: null };
        })
      );

      for (const r of results) {
        if (r.error) errors[r.idx] = r.error;
      }

      setValidationErrors(errors);
      return Object.keys(errors).length === 0;
    } finally {
      setIsValidating(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const valid = await validateRules();
      if (!valid) throw new Error("Některé Slack cíle nejsou platné");

      await supabase
        .from("notification_rules" as any)
        .delete()
        .eq("client_slug", clientSlug)
        .eq("user_id", userId);

      if (localRules.length === 0) return;

      const rows = localRules.map((r) => ({
        user_type: userType,
        user_id: userId,
        user_display_name: userDisplayName || userId,
        client_slug: clientSlug,
        rule_type: r.rule_type,
        params: r.params,
        delivery: r.delivery,
        frequency: r.frequency,
        enabled: r.enabled,
      }));

      const { error } = await supabase
        .from("notification_rules" as any)
        .insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ description: "Notifikace uloženy" });
      qc.invalidateQueries({ queryKey: ["notification-rules", clientSlug, userId] });
      handleOpenChange(false);
    },
    onError: (e: Error) => {
      if (e.message !== "Některé Slack cíle nejsou platné") {
        toast({ description: `Chyba: ${e.message}`, variant: "destructive" });
      }
    },
  });

  const addRule = () => {
    const newIdx = localRules.length;
    setLocalRules((prev) => [
      ...prev,
      {
        rule_type: "no_lead_days",
        params: { days: 3 },
        delivery: { type: "channel", channel: "#client-alerts" },
        frequency: "once" as Frequency,
        enabled: true,
      },
    ]);
    setEditingIdx(newIdx);
  };

  const updateRule = (idx: number, patch: Partial<Rule>) => {
    setLocalRules((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
  };

  const removeRule = (idx: number) => {
    setLocalRules((prev) => prev.filter((_, i) => i !== idx));
    setValidationErrors((prev) => {
      const next: Record<number, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        const ki = parseInt(k);
        if (ki < idx) next[ki] = v;
        else if (ki > idx) next[ki - 1] = v;
      }
      return next;
    });
    if (editingIdx === idx) setEditingIdx(null);
    else if (editingIdx !== null && editingIdx > idx) setEditingIdx(editingIdx - 1);
  };

  const isSaving = saveMutation.isPending || isValidating;
  const activeCount = localRules.filter((r) => r.enabled).length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Notifikace">
          <Bell className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4" /> Notifikace – {clientName}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {/* Summary bar */}
            {localRules.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                <span>{localRules.length} {localRules.length === 1 ? "pravidlo" : localRules.length < 5 ? "pravidla" : "pravidel"}</span>
                <span>·</span>
                <Badge variant={activeCount > 0 ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                  {activeCount} aktivní{activeCount === 1 ? "" : activeCount < 5 ? "ch" : "ch"}
                </Badge>
              </div>
            )}

            {/* Rules list */}
            {localRules.map((rule, idx) => {
              const isEditing = editingIdx === idx;

              return (
                <div
                  key={idx}
                  className={`border rounded-lg transition-colors ${
                    !rule.enabled ? "border-border/50 bg-muted/30 opacity-60" : "border-border"
                  } ${validationErrors[idx] ? "border-destructive/50" : ""}`}
                >
                  {/* Compact header - always visible */}
                  <div className="flex items-center gap-2 p-3">
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={(v) => updateRule(idx, { enabled: v })}
                      className="scale-75"
                    />
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setEditingIdx(isEditing ? null : idx)}>
                      <RuleSummary rule={rule} />
                    </div>
                    <button
                      onClick={() => setEditingIdx(isEditing ? null : idx)}
                      className="p-1 rounded hover:bg-muted text-muted-foreground"
                      title="Upravit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => removeRule(idx)}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      title="Smazat"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Validation error inline */}
                  {validationErrors[idx] && !isEditing && (
                    <div className="px-3 pb-2">
                      <p className="text-xs text-destructive">{validationErrors[idx]}</p>
                    </div>
                  )}

                  {/* Expanded edit form */}
                  {isEditing && (
                    <div className="border-t border-border px-4 py-3 space-y-3 bg-muted/20">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Pravidlo</Label>
                        <Select
                          value={rule.rule_type}
                          onValueChange={(v) => {
                            const patch: Partial<Rule> = { rule_type: v as Rule["rule_type"] };
                            if (v === "no_lead_days") patch.params = { days: 3, message: rule.params.message };
                            else patch.params = { message: rule.params.message };
                            updateRule(idx, patch);
                          }}
                        >
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="no_lead_days">Žádná poptávka X dní</SelectItem>
                            <SelectItem value="ads_inactive">Reklamy neaktivní</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {rule.rule_type === "no_lead_days" && (
                        <div className="space-y-2">
                          <Label className="text-xs font-medium">Počet dní bez poptávky</Label>
                          <Input
                            type="number"
                            min={1}
                            max={90}
                            value={rule.params.days || 3}
                            onChange={(e) => updateRule(idx, { params: { ...rule.params, days: parseInt(e.target.value) || 3 } })}
                            className="w-20 h-8 text-sm"
                          />
                        </div>
                      )}

                      <Collapsible>
                        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                          <ChevronDown className="h-3 w-3" />
                          Vlastní text zprávy
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-2 space-y-1.5">
                          <Textarea
                            placeholder={rule.rule_type === "no_lead_days"
                              ? "⚠️ {klient}: Reklamy běží, ale žádná poptávka už {dny} dní"
                              : "🔴 {klient}: Reklamy jsou neaktivní"}
                            value={rule.params.message || ""}
                            onChange={(e) => updateRule(idx, { params: { ...rule.params, message: e.target.value } })}
                            rows={2}
                            className="text-sm"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Proměnné: {"{klient}"}, {"{dny}"}. Prázdné = výchozí text.
                          </p>
                        </CollapsibleContent>
                      </Collapsible>

                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Frekvence</Label>
                        <Select
                          value={rule.frequency}
                          onValueChange={(v) => updateRule(idx, { frequency: v as Frequency })}
                        >
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                              <SelectItem key={value} value={value}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Doručení</Label>
                        <Select
                          value={rule.delivery.type}
                          onValueChange={(v) => {
                            const newDelivery = v === "channel"
                              ? { type: "channel" as const, channel: "#client-alerts" }
                              : { type: "dm" as const, slack_email: "" };
                            updateRule(idx, { delivery: newDelivery });
                          }}
                        >
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="channel">Slack kanál</SelectItem>
                            <SelectItem value="dm">Slack DM</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {rule.delivery.type === "channel" && (
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium">Název kanálu</Label>
                          <Input
                            placeholder="#client-alerts"
                            value={rule.delivery.channel || ""}
                            onChange={(e) => updateRule(idx, { delivery: { ...rule.delivery, channel: e.target.value } })}
                            className={`h-8 text-sm ${validationErrors[idx] ? "border-destructive" : ""}`}
                          />
                          {validationErrors[idx] && (
                            <p className="text-xs text-destructive">{validationErrors[idx]}</p>
                          )}
                        </div>
                      )}

                      {rule.delivery.type === "dm" && (
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium">Slack email</Label>
                          <Input
                            type="email"
                            placeholder="jan@firma.cz"
                            value={rule.delivery.slack_email || ""}
                            onChange={(e) => updateRule(idx, { delivery: { ...rule.delivery, slack_email: e.target.value } })}
                            className={`h-8 text-sm ${validationErrors[idx] ? "border-destructive" : ""}`}
                          />
                          {validationErrors[idx] && (
                            <p className="text-xs text-destructive">{validationErrors[idx]}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Empty state */}
            {localRules.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Zatím žádná pravidla</p>
                <p className="text-xs">Přidejte pravidlo pro zasílání upozornění do Slacku</p>
              </div>
            )}

            {/* Add rule button */}
            <Button variant="outline" size="sm" onClick={addRule} className="w-full gap-1.5 border-dashed">
              <Plus className="h-3.5 w-3.5" /> Přidat pravidlo
            </Button>

            {/* Footer actions */}
            <div className="flex justify-end gap-2 pt-1 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>Zrušit</Button>
              <Button size="sm" onClick={() => saveMutation.mutate()} disabled={isSaving || localRules.length === 0}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Uložit"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
