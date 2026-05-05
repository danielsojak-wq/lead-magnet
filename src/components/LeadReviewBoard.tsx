import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { getSessionActor } from "@/lib/session-actor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Check, X, Inbox, RotateCcw, ChevronRight, Search, Download, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { LeadDetailDrawer } from "@/components/LeadDetailDrawer";
import { Input } from "@/components/ui/input";
import { LeadExportDialog } from "@/components/LeadExportDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface LeadDetail {
  submissionId: string;
  date: string;
  firstName: string;
  lastName?: string;
  phone: string;
  qualified: string;
  customFields?: Record<string, string>;
  isDuplicate?: boolean;
  duplicateOfId?: string;
  source?: string;
}

interface LeadReviewBoardProps {
  clientSlug: string;
  dateRange?: { from?: Date; to?: Date };
}

type TabType = "unreviewed" | "qualified" | "not_qualified" | "duplicates" | "all";

const TAB_CONFIG: { key: TabType; label: string; emptyLabel: string }[] = [
  { key: "unreviewed", label: "K posouzení", emptyLabel: "Žádné nové poptávky k posouzení" },
  { key: "qualified", label: "Kvalifikované", emptyLabel: "Žádné kvalifikované poptávky" },
  { key: "not_qualified", label: "Nekvalifikované", emptyLabel: "Žádné nekvalifikované poptávky" },
  { key: "duplicates", label: "Potenciální duplicity", emptyLabel: "Žádné potenciálně duplicitní poptávky" },
  { key: "all", label: "Vše", emptyLabel: "Žádné poptávky" },
];

const REVIEWED_STATUSES = new Set(["ano", "ne", "duplicita", "duplicate", "relevant", "irrelevant"]);

export function LeadReviewBoard({ clientSlug, dateRange }: LeadReviewBoardProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>("unreviewed");
  const [selectedLead, setSelectedLead] = useState<LeadDetail | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [leadHistory, setLeadHistory] = useState<LeadDetail[]>([]);

  // Fetch all leads once
  const { data: rawData, isLoading, error } = useQuery({
    queryKey: ["leads-detail", clientSlug, "all"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("fetch-leads-detail", {
        body: { client_slug: clientSlug, filter: "all" },
      });
      if (error) throw error;
      if (Array.isArray(data)) return { leads: data as LeadDetail[], sources: [] as string[], customFieldIcons: {} as Record<string, string> };
      return data as { leads: LeadDetail[]; sources: string[]; customFieldIcons?: Record<string, string> };
    },
    staleTime: 1000 * 60 * 5,
    enabled: !!clientSlug,
  });

  // Filter by date range
  const allLeads = useMemo(() => {
    const raw = rawData?.leads ?? [];
    if (!dateRange?.from) return raw;
    const from = dateRange.from;
    const to = dateRange.to ?? new Date();
    return raw.filter((l) => {
      try {
        const d = new Date(l.date);
        return d >= from && d <= new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59);
      } catch {
        return true;
      }
    });
  }, [rawData, dateRange]);

  // Categorize leads
  const categorized = useMemo(() => {
    const unreviewed: LeadDetail[] = [];
    const qualified: LeadDetail[] = [];
    const not_qualified: LeadDetail[] = [];
    const duplicates: LeadDetail[] = [];

    for (const l of allLeads) {
      const q = l.qualified?.toLowerCase() || "";
      if (q === "ano" || q === "relevant") {
        qualified.push(l);
      } else if (q === "ne" || q === "irrelevant") {
        not_qualified.push(l);
      } else if (q === "duplicita" || q === "duplicate") {
        duplicates.push(l);
      } else if (!REVIEWED_STATUSES.has(q)) {
        unreviewed.push(l);
      }
    }

    // Also add auto-detected duplicates (isDuplicate) that aren't already in the duplicates list
    const dupIds = new Set(duplicates.map((d) => d.submissionId));
    for (const l of allLeads) {
      if (l.isDuplicate && !dupIds.has(l.submissionId)) {
        duplicates.push(l);
      }
    }

    return { unreviewed, qualified, not_qualified, duplicates, all: allLeads };
  }, [allLeads]);

  const hasMultipleSources = (rawData?.sources?.length ?? 0) > 1;
  const currentLeads = categorized[activeTab] ?? [];

  // Client-side search filtering
  const filteredLeads = useMemo(() => {
    let result = currentLeads;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((l) => {
        const name = `${l.firstName} ${l.lastName || ""}`.toLowerCase();
        const phone = l.phone?.toLowerCase() || "";
        const email = l.customFields?.Email?.toLowerCase() || l.customFields?.email?.toLowerCase() || "";
        const company = Object.entries(l.customFields || {}).find(([k]) =>
          k.toLowerCase().includes("firm") || k.toLowerCase().includes("společn") || k.toLowerCase().includes("company")
        )?.[1]?.toLowerCase() || "";
        return name.includes(q) || phone.includes(q) || email.includes(q) || company.includes(q);
      });
    }
    return result;
  }, [currentLeads, searchQuery]);

  const allRawLeads = rawData?.leads ?? [];

  const navigateToLead = useCallback((submissionId: string) => {
    // Search in ALL leads (unfiltered by date) so duplicate originals are always reachable
    const target = allRawLeads.find((l) => l.submissionId === submissionId);
    if (target) {
      if (selectedLead) {
        setLeadHistory((prev) => [...prev, selectedLead]);
      }
      setSelectedLead(target);
      setDrawerOpen(true);
    } else {
      toast({ description: "Duplikát nebyl nalezen v historii" });
    }
  }, [allRawLeads, selectedLead, toast]);

  const navigateBack = useCallback(() => {
    if (leadHistory.length > 0) {
      const prev = leadHistory[leadHistory.length - 1];
      setLeadHistory((h) => h.slice(0, -1));
      setSelectedLead(prev);
    }
  }, [leadHistory]);

  const openLead = useCallback((lead: LeadDetail) => {
    setLeadHistory([]);
    setSelectedLead(lead);
    setDrawerOpen(true);
  }, []);

  const reviewMutation = useMutation({
    mutationFn: async ({ submissionId, status }: { submissionId: string; status: "relevant" | "irrelevant" | "duplicate" | "unreviewed" }) => {
      if (status === "unreviewed") {
        // Delete the review to reset to unreviewed
        const { error: dbError } = await supabase
          .from("lead_reviews" as any)
          .delete()
          .eq("client_slug", clientSlug)
          .eq("submission_id", submissionId);
        if (dbError) throw dbError;

        supabase.functions.invoke("write-lead-review", {
          body: { submissionId, status: "unreviewed", clientSlug },
        }).catch((err) => console.error("Sheet write-back failed:", err));
      } else {
        const { error: dbError } = await supabase
          .from("lead_reviews" as any)
          .upsert(
            {
              client_slug: clientSlug,
              submission_id: submissionId,
              status,
            } as any,
            { onConflict: "client_slug,submission_id" }
          );
        if (dbError) throw dbError;

        supabase.functions.invoke("write-lead-review", {
          body: { submissionId, status, clientSlug },
        }).catch((err) => console.error("Sheet write-back failed:", err));
      }
    },
    onSuccess: (_, variables) => {
      const actor = getSessionActor();

      // Optimistic update: change qualified in the "all" query data
      const newQualified = variables.status === "relevant" ? "ano" : variables.status === "duplicate" ? "duplicita" : variables.status === "unreviewed" ? "" : "ne";
      queryClient.setQueryData(
        ["leads-detail", clientSlug, "all"],
        (old: any) => {
          if (!old) return old;
          const oldLeads = old.leads || old;
          const newLeads = (Array.isArray(oldLeads) ? oldLeads : []).map((l: LeadDetail) =>
            l.submissionId === variables.submissionId
              ? { ...l, qualified: newQualified }
              : l
          );
          return { ...old, leads: newLeads };
        }
      );
      queryClient.invalidateQueries({ queryKey: ["leads", clientSlug] });

      // Determine previous status label
      const lead = allLeads.find(l => l.submissionId === variables.submissionId);
      const prevQualified = lead?.qualified?.toLowerCase() || "";
      const prevLabel = prevQualified === "ano" || prevQualified === "relevant" ? "Kvalifikovaná"
        : prevQualified === "ne" || prevQualified === "irrelevant" ? "Nekvalifikovaná"
        : prevQualified === "duplicita" || prevQualified === "duplicate" ? "Duplicita"
        : "Neposouzeno";

      const statusLabel = variables.status === "relevant" ? "Kvalifikovaná"
        : variables.status === "irrelevant" ? "Nekvalifikovaná"
        : variables.status === "duplicate" ? "Duplicita"
        : "K posouzení";

      // Log status change to timeline with actor + from→to
      supabase
        .from("lead_timeline" as any)
        .insert({
          client_slug: clientSlug,
          submission_id: variables.submissionId,
          event_type: "status_change",
          status: variables.status,
          content: `${prevLabel} → ${statusLabel}`,
          actor,
        } as any)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["lead-timeline", clientSlug, variables.submissionId] });
        });

      // Log to activity log with actor
      const leadName = lead ? (lead.lastName ? `${lead.firstName} ${lead.lastName}` : lead.firstName) : variables.submissionId;
      logActivity(clientSlug, "review", `Posouzení: ${leadName} – ${prevLabel} → ${statusLabel}`, actor);

      toast({
        description: variables.status === "relevant" ? "Označeno jako kvalifikovaná" : variables.status === "duplicate" ? "Označeno jako duplicita" : variables.status === "unreviewed" ? "Vráceno k posouzení" : "Označeno jako nekvalifikovaná",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        description: "Chyba při ukládání hodnocení",
      });
    },
  });

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const formatPhone = (phone: string) => {
    if (!phone) return "—";
    const cleaned = phone.replace(/\D/g, "");
    if (!cleaned) return phone;
    const groups: string[] = [];
    let i = cleaned.length;
    while (i > 0) {
      const start = Math.max(0, i - 3);
      groups.unshift(cleaned.slice(start, i));
      i = start;
    }
    const formatted = groups.join(" ");
    return phone.startsWith("+") || cleaned.length >= 11 ? `+${formatted}` : formatted;
  };

  const getStatusBadge = (qualified: string) => {
    if (qualified === "ano") {
      return <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 text-xs">Kvalifikovaná</Badge>;
    }
    if (qualified === "ne") {
      return <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50 text-xs">Nekvalifikovaná</Badge>;
    }
    if (qualified === "duplicita" || qualified === "duplicate") {
      return <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50 text-xs">Duplicita</Badge>;
    }
    return <Badge variant="outline" className="text-muted-foreground text-xs">Neposouzeno</Badge>;
  };

  const getLeadActions = (lead: LeadDetail) => {
    const q = lead.qualified?.toLowerCase() || "";
    const isQualified = q === "ano" || q === "relevant";
    const isNotQualified = q === "ne" || q === "irrelevant";
    const isDuplicate = q === "duplicita" || q === "duplicate";
    const isUnreviewed = !isQualified && !isNotQualified && !isDuplicate;

    if (isUnreviewed) {
      // For leads flagged as duplicates, show a compact "Vyřešit" dropdown
      if (lead.isDuplicate) {
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                disabled={reviewMutation.isPending}
              >
                Vyřešit
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem
                onClick={() => reviewMutation.mutate({ submissionId: lead.submissionId, status: "relevant" })}
                className="text-green-600"
              >
                <Check className="h-4 w-4 mr-2" />
                Kvalifikovaná
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => reviewMutation.mutate({ submissionId: lead.submissionId, status: "irrelevant" })}
                className="text-red-600"
              >
                <X className="h-4 w-4 mr-2" />
                Nekvalifikovaná
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => reviewMutation.mutate({ submissionId: lead.submissionId, status: "duplicate" })}
                className="text-orange-600"
              >
                <Copy className="h-4 w-4 mr-2" />
                Duplicita
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      }

      // Regular unreviewed leads: show inline buttons
      return (
        <>
           <Button
             size="sm"
             variant="outline"
             className="text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700 flex-1 md:flex-none px-3 py-2 min-h-[44px] md:min-h-0 md:py-0"
             onClick={(e) => {
               e.stopPropagation();
               reviewMutation.mutate({ submissionId: lead.submissionId, status: "relevant" });
             }}
             disabled={reviewMutation.isPending}
           >
             <Check className="h-5 w-5 md:h-4 md:w-4 md:mr-1" />
             <span className="hidden md:inline">Kvalifikovaná</span>
           </Button>
           <Button
             size="sm"
             variant="outline"
             className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 flex-1 md:flex-none px-3 py-2 min-h-[44px] md:min-h-0 md:py-0"
             onClick={(e) => {
               e.stopPropagation();
               reviewMutation.mutate({ submissionId: lead.submissionId, status: "irrelevant" });
             }}
             disabled={reviewMutation.isPending}
           >
             <X className="h-5 w-5 md:h-4 md:w-4 md:mr-1" />
             <span className="hidden md:inline">Nekvalifikovaná</span>
           </Button>
        </>
      );
    }

    // For reviewed leads: show dropdown with options
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            disabled={reviewMutation.isPending}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Změnit
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {!isQualified && (
            <DropdownMenuItem
              onClick={() => reviewMutation.mutate({ submissionId: lead.submissionId, status: "relevant" })}
              className="text-green-600"
            >
              <Check className="h-4 w-4 mr-2" />
              Kvalifikovaná
            </DropdownMenuItem>
          )}
          {!isNotQualified && (
            <DropdownMenuItem
              onClick={() => reviewMutation.mutate({ submissionId: lead.submissionId, status: "irrelevant" })}
              className="text-red-600"
            >
              <X className="h-4 w-4 mr-2" />
              Nekvalifikovaná
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => reviewMutation.mutate({ submissionId: lead.submissionId, status: "unreviewed" as any })}
          >
            <Inbox className="h-4 w-4 mr-2" />
            K posouzení
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="md" label="Načítám poptávky…" />
      </div>
    );
  }

  if (error) {
    return null;
  }

  const activeConfig = TAB_CONFIG.find((t) => t.key === activeTab)!;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Poptávky</CardTitle>
          <LeadExportDialog clientSlug={clientSlug}>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
          </LeadExportDialog>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 sm:gap-1.5 mt-2">
          {TAB_CONFIG.map((tab) => {
            const count = categorized[tab.key]?.length ?? 0;
            const isActive = activeTab === tab.key;
            return (
              <Button
                key={tab.key}
                size="sm"
                variant={isActive ? "default" : "outline"}
                onClick={() => setActiveTab(tab.key)}
                className={`text-xs ${isActive ? "bg-foreground text-background hover:bg-foreground/90" : ""}`}
              >
                {tab.label}
                {count > 0 && (
                  <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs leading-none ${
                    isActive
                      ? "bg-background/20 text-background"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {count}
                  </span>
                )}
              </Button>
            );
          })}
        </div>

        {/* Search */}
        <div className="mt-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Hledat dle jména, telefonu, emailu…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Inbox className="h-10 w-10 mb-3 opacity-50" />
            <p className="text-sm font-medium">
              {searchQuery ? "Žádné poptávky odpovídající filtru" : activeConfig.emptyLabel}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredLeads.map((lead) => (
              <div
                key={lead.submissionId}
                className="relative flex flex-col md:flex-row md:items-center gap-2 md:gap-0 p-3 sm:p-4 rounded-lg border bg-card cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => openLead(lead)}
              >
                {/* Left: date + name + phone with labels on desktop */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-6 min-w-0 flex-1 pr-8 md:pr-0">
                  <div className="md:min-w-[100px] shrink-0">
                    <p className="text-xs text-muted-foreground hidden md:block">Datum</p>
                    <p className="text-xs md:text-sm">{formatDate(lead.date)}</p>
                  </div>
                  <div className="md:min-w-[160px] shrink-0">
                    <p className="text-xs text-muted-foreground hidden md:block">Jméno</p>
                    <p className="text-sm font-medium whitespace-nowrap">{lead.lastName ? `${lead.firstName} ${lead.lastName}` : lead.firstName}</p>
                  </div>
                  <div className="shrink-0">
                    <p className="text-xs text-muted-foreground hidden md:block">Telefon</p>
                    <p className="text-xs sm:text-sm">{formatPhone(lead.phone)}</p>
                  </div>
                  {hasMultipleSources && lead.source && (
                    <Badge variant="outline" className="text-muted-foreground border-border/60 text-[10px] w-fit font-normal">
                      {lead.source}
                    </Badge>
                  )}
                  {lead.isDuplicate && activeTab !== "duplicates" && (
                    <Badge
                      variant="outline"
                      className="text-orange-600 border-orange-200 bg-orange-50 text-xs cursor-pointer hover:bg-orange-100 transition-colors gap-1 w-fit"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (lead.duplicateOfId) navigateToLead(lead.duplicateOfId);
                      }}
                    >
                       <Copy className="h-3 w-3" />
                      Potenciální duplicita
                    </Badge>
                  )}
                  {activeTab === "all" && getStatusBadge(lead.qualified)}
                </div>
                {/* Actions: full width on mobile, inline on desktop */}
                <div className="flex md:hidden items-center gap-2 w-full">
                  <div className="flex gap-2 flex-1">
                    {getLeadActions(lead)}
                  </div>
                </div>
                <div className="hidden md:flex items-center gap-1.5 shrink-0">
                  {getLeadActions(lead)}
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
                {/* Mobile chevron - absolute right */}
                <ChevronRight className="h-4 w-4 text-muted-foreground absolute right-3 top-4 md:hidden" />
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <LeadDetailDrawer
        lead={selectedLead}
        clientSlug={clientSlug}
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) setLeadHistory([]);
        }}
        onReview={(submissionId, status) => reviewMutation.mutate({ submissionId, status })}
        reviewPending={reviewMutation.isPending}
        onNavigateToDuplicate={navigateToLead}
        onNavigateBack={leadHistory.length > 0 ? navigateBack : undefined}
        showSource={hasMultipleSources}
        customFieldIcons={rawData?.customFieldIcons}
      />
    </Card>
  );
}
