import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { Filter, Loader2 } from "lucide-react";

interface Campaign {
  name: string;
  isLead: boolean;
}

interface LeadCampaignsDialogProps {
  clientSlug: string;
  darkBar?: boolean;
}

export function LeadCampaignsDialog({ clientSlug, darkBar }: LeadCampaignsDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ["lead-campaigns", clientSlug],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-lead-campaigns", {
        body: { client_slug: clientSlug, action: "list" },
      });
      if (error) throw error;
      return data;
    },
    enabled: open && !!clientSlug,
    staleTime: 1000 * 60 * 5,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ campaignName, isLead }: { campaignName: string; isLead: boolean }) => {
      const { error } = await supabase.functions.invoke("manage-lead-campaigns", {
        body: {
          client_slug: clientSlug,
          action: isLead ? "add" : "remove",
          campaign_name: campaignName,
        },
      });
      if (error) throw error;
      return { campaignName, isLead };
    },
    onSuccess: ({ campaignName, isLead }) => {
      queryClient.setQueryData<Campaign[]>(
        ["lead-campaigns", clientSlug],
        (old) =>
          old?.map((c) =>
            c.name === campaignName ? { ...c, isLead } : c
          ) ?? []
      );
      // Invalidate marketing costs so they re-fetch with new filter
      queryClient.invalidateQueries({ queryKey: ["marketing-costs", clientSlug] });
    },
    onError: () => {
      toast({ variant: "destructive", description: "Chyba při ukládání" });
    },
  });

  const selectedCount = campaigns?.filter((c) => c.isLead).length ?? 0;
  const totalCount = campaigns?.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 px-2 text-xs gap-1 ${darkBar ? "text-background hover:text-background hover:bg-background/10" : ""}`}
        >
          <Filter className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Kampaně</span>
          {selectedCount > 0 && (
            <span className={`ml-0.5 text-[10px] rounded-full px-1.5 py-0.5 leading-none ${darkBar ? "bg-background/20" : "bg-primary/10 text-primary"}`}>
              {selectedCount}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="text-lg">Leadové kampaně</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Označte kampaně, jejichž náklady se mají započítat do leadového dashboardu.
            {selectedCount === 0 && totalCount > 0 && (
              <span className="block mt-1 text-xs text-muted-foreground/70">
                Pokud žádná kampaň není vybrána, počítají se náklady ze všech kampaní.
              </span>
            )}
          </p>
        </DialogHeader>

        <ScrollArea className="h-[55vh] px-6 pb-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="md" label="Načítám kampaně…" />
            </div>
          ) : !campaigns || campaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Filter className="h-8 w-8 mb-3 opacity-40" />
              <p className="text-sm">Žádné kampaně nalezeny v datech</p>
            </div>
          ) : (
            <div className="space-y-1 pt-4">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-border">
                <span className="text-xs text-muted-foreground">
                  {selectedCount} z {totalCount} vybráno
                </span>
              </div>
              {campaigns.map((campaign) => (
                <label
                  key={campaign.name}
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <Checkbox
                    checked={campaign.isLead}
                    disabled={toggleMutation.isPending}
                    onCheckedChange={(checked) => {
                      toggleMutation.mutate({
                        campaignName: campaign.name,
                        isLead: !!checked,
                      });
                    }}
                  />
                  <span className="text-sm truncate flex-1">{campaign.name}</span>
                  {toggleMutation.isPending && toggleMutation.variables?.campaignName === campaign.name && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                </label>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
