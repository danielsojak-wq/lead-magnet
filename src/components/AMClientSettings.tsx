import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { ClientLogo } from "@/components/ClientLogo";

interface AMClientSettingsProps {
  amId: string;
  amName: string;
  onBack: () => void;
}

export function AMClientSettings({ amId, amName, onBack }: AMClientSettingsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all clients + eshop info via edge function (bypasses RLS)
  const { data: clientListData, isLoading: loadingClients } = useQuery({
    queryKey: ["client-list-for-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-eshop-config", {
        body: { action: "list" },
      });
      if (error) throw error;
      return data;
    },
  });

  const allClients = (clientListData?.allClients || []) as Array<{ slug: string; name: string; display_name?: string | null }>;
  const eshopSlugs = new Set((clientListData?.eshopClients || []).map((c: any) => c.slug));

  // Fetch current assignments
  const { data: assignments, isLoading: loadingAssignments } = useQuery({
    queryKey: ["am-assignments", amId],
    queryFn: async () => {
      const { data } = await supabase
        .from("account_manager_clients")
        .select("id, client_slug, section")
        .eq("account_manager_id", amId);
      return data || [];
    },
  });

  // Local state for pending changes
  const [localAssignments, setLocalAssignments] = useState<Map<string, Set<string>>>(new Map());
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!assignments) return;
    const map = new Map<string, Set<string>>();
    for (const a of assignments) {
      if (!map.has(a.client_slug)) map.set(a.client_slug, new Set());
      map.get(a.client_slug)!.add(a.section);
    }
    setLocalAssignments(map);
    setDirty(false);
  }, [assignments]);

  const toggleAssignment = (slug: string, section: string) => {
    setLocalAssignments((prev) => {
      const next = new Map(prev);
      if (!next.has(slug)) next.set(slug, new Set());
      const sections = new Set(next.get(slug)!);
      if (sections.has(section)) sections.delete(section);
      else sections.add(section);
      if (sections.size === 0) next.delete(slug);
      else next.set(slug, sections);
      return next;
    });
    setDirty(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Build desired state
      const desired: { client_slug: string; section: string }[] = [];
      localAssignments.forEach((sections, slug) => {
        sections.forEach((sec) => desired.push({ client_slug: slug, section: sec }));
      });

      const { error } = await supabase.functions.invoke("manage-am-clients", {
        body: { action: "set_all", am_id: amId, assignments: desired },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ description: "Přiřazení uloženo" });
      queryClient.invalidateQueries({ queryKey: ["am-assignments", amId] });
      queryClient.invalidateQueries({ queryKey: ["am-clients"] });
      setDirty(false);
    },
    onError: (err: any) => {
      toast({ variant: "destructive", description: err.message || "Chyba při ukládání" });
    },
  });

  const isLoading = loadingClients || loadingAssignments;

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" /> Zpět na přehled
      </button>

      <div className="bg-card border rounded-xl p-6">
        <div className="flex items-center gap-2.5 mb-6">
          <Users className="h-5 w-5" />
          <h2 className="text-xl font-bold">Moji klienti</h2>
        </div>

        <p className="text-sm text-muted-foreground mb-5">
          Vyberte klienty, které chcete spravovat v sekcích Leadgen a Ecommerce.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : (
          <>
            <div className="space-y-1">
              {/* Header */}
              <div className="grid grid-cols-[1fr_80px_80px] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                <span>Klient</span>
                <span className="text-center">Leadgen</span>
                <span className="text-center">Ecommerce</span>
              </div>

              {(allClients || []).map((client) => {
                const sections = localAssignments.get(client.slug!) || new Set();
                const hasEshop = eshopSlugs.has(client.slug!);

                return (
                  <div
                    key={client.slug}
                    className="grid grid-cols-[1fr_80px_80px] gap-2 items-center px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ClientLogo slug={client.slug!} name={client.display_name || client.name || ""} />
                      <span className="text-sm font-medium truncate">
                        {client.display_name || client.name}
                      </span>
                    </div>
                    <div className="flex justify-center">
                      <Checkbox
                        checked={sections.has("leadgen")}
                        onCheckedChange={() => toggleAssignment(client.slug!, "leadgen")}
                      />
                    </div>
                    <div className="flex justify-center">
                      {hasEshop ? (
                        <Checkbox
                          checked={sections.has("ecommerce")}
                          onCheckedChange={() => toggleAssignment(client.slug!, "ecommerce")}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={onBack}>Zrušit</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={!dirty || saveMutation.isPending}>
                {saveMutation.isPending ? "Ukládám…" : "Uložit"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
