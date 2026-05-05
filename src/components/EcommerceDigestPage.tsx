import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, Hash, Mail, Loader2, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DAY_LABELS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const DAY_VALUES = [1, 2, 3, 4, 5, 6, 7];

interface DigestSchedule {
  id?: string;
  enabled: boolean;
  schedule_type: "daily" | "weekly";
  schedule_time: string;
  schedule_days: number[];
  delivery_type: "channel" | "dm";
  delivery_channel: string;
  delivery_slack_email: string;
}

const DEFAULT_SCHEDULE: DigestSchedule = {
  enabled: false,
  schedule_type: "daily",
  schedule_time: "08:00",
  schedule_days: [1, 2, 3, 4, 5],
  delivery_type: "channel",
  delivery_channel: "",
  delivery_slack_email: "",
};

export function EcommerceDigestPage({ amId, onBack }: { amId: string; onBack: () => void }) {
  const [schedule, setSchedule] = useState<DigestSchedule>(DEFAULT_SCHEDULE);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: existing, isLoading } = useQuery({
    queryKey: ["ecommerce-digest", amId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ecommerce_digest_schedules")
        .select("*")
        .eq("am_id", amId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!amId,
  });

  useEffect(() => {
    if (existing) {
      setSchedule({
        id: existing.id,
        enabled: existing.enabled,
        schedule_type: existing.schedule_type as "daily" | "weekly",
        schedule_time: existing.schedule_time,
        schedule_days: existing.schedule_days || [1, 2, 3, 4, 5],
        delivery_type: (existing.delivery_type as "channel" | "dm") || "channel",
        delivery_channel: existing.delivery_channel || "",
        delivery_slack_email: existing.delivery_slack_email || "",
      });
    } else if (existing === null) {
      setSchedule(DEFAULT_SCHEDULE);
    }
  }, [existing]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (schedule.delivery_type === "channel" && !schedule.delivery_channel.trim()) {
        throw new Error("Vyplňte Slack kanál");
      }
      if (schedule.delivery_type === "dm" && !schedule.delivery_slack_email.trim()) {
        throw new Error("Vyplňte Slack e-mail");
      }

      const { data: validation } = await supabase.functions.invoke("validate-slack-target", {
        body: {
          type: schedule.delivery_type,
          channel: schedule.delivery_channel,
          slack_email: schedule.delivery_slack_email,
        },
      });

      if (!validation?.valid) {
        throw new Error(validation?.error || "Slack cil nelze overit");
      }

      const row = {
        am_id: amId,
        enabled: schedule.enabled,
        schedule_type: schedule.schedule_type,
        schedule_time: schedule.schedule_time,
        schedule_days: schedule.schedule_days,
        delivery_type: schedule.delivery_type,
        delivery_channel: schedule.delivery_type === "channel" ? schedule.delivery_channel.replace(/^#/, "") : null,
        delivery_slack_email: schedule.delivery_type === "dm" ? schedule.delivery_slack_email : null,
      };

      if (schedule.id) {
        const { error } = await supabase
          .from("ecommerce_digest_schedules")
          .update(row)
          .eq("id", schedule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("ecommerce_digest_schedules")
          .insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ecommerce-digest", amId] });
      toast({ description: "Nastaveni digestu ulozeno" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("send-ecommerce-digest", {
        body: { am_id: amId, test: true },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast({ description: `Testovaci zprava odeslana (${data?.sent || 0} klientu)` });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message });
    },
  });

  const toggleDay = (day: number) => {
    setSchedule((s) => ({
      ...s,
      schedule_days: s.schedule_days.includes(day)
        ? s.schedule_days.filter((d) => d !== day)
        : [...s.schedule_days, day].sort(),
    }));
  };

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-4 gap-1.5">
        <ArrowLeft className="h-4 w-4" />
        Zpět na přehled
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifikace
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Enable toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Aktivní</p>
                  <p className="text-xs text-muted-foreground">
                    Automatické denní/týdenní shrnutí na Slack
                  </p>
                </div>
                <Switch
                  checked={schedule.enabled}
                  onCheckedChange={(v) => setSchedule((s) => ({ ...s, enabled: v }))}
                />
              </div>

              {/* Schedule type */}
              <div className="space-y-2">
                <Label className="text-sm">Frekvence</Label>
                <Select
                  value={schedule.schedule_type}
                  onValueChange={(v) => setSchedule((s) => ({ ...s, schedule_type: v as "daily" | "weekly" }))}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Denně</SelectItem>
                    <SelectItem value="weekly">Vybrané dny</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Day selection for weekly */}
              {schedule.schedule_type === "weekly" && (
                <div className="space-y-2">
                  <Label className="text-sm">Dny v týdnu</Label>
                  <div className="flex gap-1.5">
                    {DAY_VALUES.map((day, i) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={`w-9 h-9 rounded-md text-xs font-medium border transition-colors ${
                          schedule.schedule_days.includes(day)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground border-border hover:border-primary/50"
                        }`}
                      >
                        {DAY_LABELS[i]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Time */}
              <div className="space-y-2">
                <Label className="text-sm">Čas odeslání</Label>
                <Input
                  type="time"
                  value={schedule.schedule_time}
                  onChange={(e) => setSchedule((s) => ({ ...s, schedule_time: e.target.value }))}
                  className="w-32"
                />
              </div>

              {/* Delivery */}
              <div className="space-y-3">
                <Label className="text-sm">Doručení</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={schedule.delivery_type === "channel" ? "default" : "outline"}
                    size="sm"
                    className="gap-1"
                    onClick={() => setSchedule((s) => ({ ...s, delivery_type: "channel" }))}
                  >
                    <Hash className="h-3.5 w-3.5" /> Kanál
                  </Button>
                  <Button
                    type="button"
                    variant={schedule.delivery_type === "dm" ? "default" : "outline"}
                    size="sm"
                    className="gap-1"
                    onClick={() => setSchedule((s) => ({ ...s, delivery_type: "dm" }))}
                  >
                    <Mail className="h-3.5 w-3.5" /> DM
                  </Button>
                </div>

                {schedule.delivery_type === "channel" ? (
                  <Input
                    placeholder="#kanál"
                    value={schedule.delivery_channel}
                    onChange={(e) => setSchedule((s) => ({ ...s, delivery_channel: e.target.value }))}
                    className="max-w-xs"
                  />
                ) : (
                  <Input
                    placeholder="vas@email.com"
                    type="email"
                    value={schedule.delivery_slack_email}
                    onChange={(e) => setSchedule((s) => ({ ...s, delivery_slack_email: e.target.value }))}
                    className="max-w-xs"
                  />
                )}
              </div>

              {/* Preview info */}
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Obsah zprávy:</p>
                <p>📊 Souhrn klientů seskupených dle stavu pacing semaforu (🟢🟡🔴) s odchylkou v %.</p>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Uložit
                </Button>
                <Button
                  variant="outline"
                  onClick={() => testMutation.mutate()}
                  disabled={testMutation.isPending}
                >
                  {testMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Odeslat test
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
