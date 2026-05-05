import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Shield, LogOut, ChevronDown, ChevronRight, LayoutDashboard, Plus, Clock, ShoppingCart, BarChart3 } from "lucide-react";
import { HelpDialog } from "@/components/HelpDialog";
import { LeadCampaignsDialog } from "@/components/LeadCampaignsDialog";
import { CreateClientWizard } from "@/components/CreateClientWizard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { PageSpinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Circle, Settings2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";

import { ClientActivityDialog } from "@/components/ClientActivityDialog";
import { ClientLogo } from "@/components/ClientLogo";
import { NotificationSettingsDialog } from "@/components/NotificationSettingsDialog";

const SESSION_KEY = "dashboard_auth";

interface ClientInfo {
  slug: string;
  display_name: string | null;
  name: string;
}

interface OverviewClient {
  slug: string;
  name: string;
  adsActive: boolean;
  lastLeadDaysAgo: number | null;
  lastActivity: { at: string; description: string | null } | null;
}

interface AMOverviewProps {
  amId: string;
  amName: string;
  clients: ClientInfo[];
  assignedSlugs: string[];
  onSelectClient: (slug: string) => void;
}

function AMBarClientLogo({ slug, name }: { slug: string; name: string }) {
  return <ClientLogo slug={slug} name={name} className="h-5 max-w-[100px] object-contain brightness-0 invert" fallbackText />;
}

export function AMBar({
  amName,
  clients,
  assignedSlugs,
  currentSlug,
  onSwitch,
  section = "leadgen",
  onSectionChange,
}: {
  amName: string;
  clients: ClientInfo[];
  assignedSlugs: string[];
  currentSlug: string | null;
  onSwitch: (slug: string | null) => void;
  section?: "leadgen" | "ecommerce";
  onSectionChange?: (section: "leadgen" | "ecommerce") => void;
}) {
  const navigate = useNavigate();
  const currentClient = currentSlug ? clients.find((c) => c.slug === currentSlug) : null;

  const sortByName = (a: ClientInfo, b: ClientInfo) => (a.display_name || a.name).localeCompare(b.display_name || b.name, "cs");
  const myClients = clients.filter((c) => assignedSlugs.includes(c.slug)).sort(sortByName);
  const otherClients = clients.filter((c) => !assignedSlugs.includes(c.slug)).sort(sortByName);

  // Fetch last activity for this AM's assigned clients
  const [lastActivity, setLastActivity] = useState<string | null>(null);

  useEffect(() => {
    if (assignedSlugs.length === 0) return;
    supabase
      .from("client_activity_log")
      .select("created_at")
      .in("client_slug", assignedSlugs)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setLastActivity(data[0].created_at);
        }
      });
  }, [assignedSlugs]);

  const formatRelativeShort = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return "právě teď";
      if (diffMin < 60) return `${diffMin} min`;
      const diffH = Math.floor(diffMin / 60);
      if (diffH < 24) return `${diffH} h`;
      const diffD = Math.floor(diffH / 24);
      return `${diffD} d`;
    } catch {
      return "";
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY);
    navigate("/");
  };

  return (
    <div className="sticky top-0 z-[60] bg-foreground text-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-3.5 w-3.5 opacity-70" />
          <span className="text-xs font-medium opacity-70">{amName}</span>
          {lastActivity && (
            <>
              <span className="text-xs opacity-30 mx-0.5">·</span>
              <span className="text-xs opacity-50 flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {formatRelativeShort(lastActivity)}
              </span>
            </>
          )}
          <span className="text-xs opacity-40 mx-1">|</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-background hover:text-background hover:bg-background/10"
              >
                {currentClient ? (currentClient.display_name || currentClient.name) : "Přehled"}
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[200px]">
              <DropdownMenuItem
                onClick={() => onSwitch(null)}
                className={currentSlug === null ? "bg-accent" : ""}
              >
                <LayoutDashboard className="h-4 w-4 mr-2 opacity-60" />
                Přehled klientů
              </DropdownMenuItem>
              {myClients.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Moji klienti</div>
                  {myClients.map((client) => (
                    <DropdownMenuItem
                      key={client.slug}
                      onClick={() => onSwitch(client.slug)}
                      className={client.slug === currentSlug ? "bg-accent" : ""}
                    >
                      <ClientLogo slug={client.slug} name={client.display_name || client.name} className="h-4 w-4 object-contain mr-2" />
                      {client.display_name || client.name}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              {otherClients.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Ostatní</div>
                  {otherClients.map((client) => (
                    <DropdownMenuItem
                      key={client.slug}
                      onClick={() => onSwitch(client.slug)}
                      className={`opacity-60 ${client.slug === currentSlug ? "bg-accent" : ""}`}
                    >
                      <ClientLogo slug={client.slug} name={client.display_name || client.name} className="h-4 w-4 object-contain mr-2" />
                      {client.display_name || client.name}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-1">
          {onSectionChange && (
            <div className="flex items-center bg-background/10 rounded-md p-0.5 mr-1">
              <Button
                variant="ghost"
                size="sm"
                className={`h-6 px-2 text-[10px] rounded-sm ${section === "leadgen" ? "bg-background/20 text-background" : "text-background/60 hover:text-background hover:bg-transparent"}`}
                onClick={() => { onSectionChange("leadgen"); onSwitch(null); }}
              >
                <BarChart3 className="h-3 w-3 mr-1" />
                Leadgen
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`h-6 px-2 text-[10px] rounded-sm ${section === "ecommerce" ? "bg-background/20 text-background" : "text-background/60 hover:text-background hover:bg-transparent"}`}
                onClick={() => { onSectionChange("ecommerce"); onSwitch(null); }}
              >
                <ShoppingCart className="h-3 w-3 mr-1" />
                Ecommerce
              </Button>
            </div>
          )}
          <HelpDialog role="account_manager" darkBar />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-background hover:text-background hover:bg-background/10"
            onClick={handleLogout}
          >
            <LogOut className="h-3 w-3 mr-1" />
            Odhlásit
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AMOverview({ amId, amName, clients, assignedSlugs: initialAssigned, onSelectClient }: AMOverviewProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [assignedSlugs, setAssignedSlugs] = useState<string[]>(initialAssigned);
  const [showSettings, setShowSettings] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const { data: rawOverview, isLoading } = useQuery<{ clients: OverviewClient[]; amActivity: Record<string, { at: string; description: string | null }> }>({
    queryKey: ["admin-overview"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("fetch-admin-overview");
      if (error) throw error;
      if (Array.isArray(data)) return { clients: data, amActivity: {} };
      return data;
    },
    staleTime: 60_000,
  });
  const overviewData = rawOverview?.clients || [];

  const toggleMutation = useMutation({
    mutationFn: async ({ slug, assign }: { slug: string; assign: boolean }) => {
      const { data, error } = await supabase.functions.invoke("manage-am-clients", {
        body: { amId, clientSlug: slug, action: assign ? "assign" : "unassign" },
      });
      if (error) throw error;
      return { slug, assign };
    },
    onSuccess: ({ slug, assign }) => {
      setAssignedSlugs((prev) =>
        assign ? [...prev, slug] : prev.filter((s) => s !== slug)
      );
      // Update localStorage
      const stored = localStorage.getItem(SESSION_KEY);
      if (stored) {
        const auth = JSON.parse(stored);
        auth.assignedSlugs = assign
          ? [...(auth.assignedSlugs || []), slug]
          : (auth.assignedSlugs || []).filter((s: string) => s !== slug);
        localStorage.setItem(SESSION_KEY, JSON.stringify(auth));
      }
      toast({ description: assign ? "Klient přiřazen" : "Klient odebrán" });
    },
  });

  const sortByName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "cs");
  const myClients = overviewData.filter((c) => assignedSlugs.includes(c.slug)).sort(sortByName);
  const otherClients = overviewData.filter((c) => !assignedSlugs.includes(c.slug)).sort(sortByName);

  const renderDaysAgo = (days: number | null) => {
    if (days === null) return "—";
    if (days === 0) return "Dnes";
    if (days === 1) return "Včera";
    return `před ${days} dny`;
  };

  const formatRelative = (dateStr: string) => {
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
  };

  const renderRow = (client: OverviewClient, dimmed = false) => (
    <TableRow
      key={client.slug}
      className={`cursor-pointer ${dimmed ? "opacity-50" : ""}`}
      onClick={() => onSelectClient(client.slug)}
    >
      <TableCell className="py-3">
        <ClientLogo slug={client.slug} name={client.name} />
      </TableCell>
      <TableCell className="font-medium">{client.name}</TableCell>
      <TableCell className="text-center">
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
      <TableCell className="text-right text-muted-foreground">
        {renderDaysAgo(client.lastLeadDaysAgo)}
      </TableCell>
      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
        <ClientActivityDialog clientSlug={client.slug} clientName={client.name}>
          <button className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 ml-auto">
            <Clock className="h-3 w-3" />
            {client.lastActivity ? formatRelative(client.lastActivity.at) : "—"}
          </button>
        </ClientActivityDialog>
      </TableCell>
      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          <NotificationSettingsDialog
            clientSlug={client.slug}
            clientName={client.name}
            userType="am"
            userId={amName}
            userDisplayName={amName}
          />
          <LeadCampaignsDialog clientSlug={client.slug} />
        </div>
      </TableCell>
    </TableRow>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:h-[56px] flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0 justify-between">
          <div className="flex items-center">
            <h1 className="text-sm font-semibold tracking-tight text-foreground">Přehled klientů</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 flex-1 sm:flex-none"
              onClick={() => setWizardOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" /> Nový klient
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 flex-1 sm:flex-none"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings2 className="h-3.5 w-3.5" />
              {showSettings ? "Hotovo" : "Nastavit klienty"}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <PageSpinner label="Načítám klienty…" />
        ) : showSettings ? (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/30">
              <p className="text-sm text-muted-foreground">Vyberte klienty, které spravujete</p>
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
                {/* Assigned clients first */}
                {(clients || [])
                  .slice()
                  .sort((a, b) => {
                    const aAssigned = assignedSlugs.includes(a.slug) ? 0 : 1;
                    const bAssigned = assignedSlugs.includes(b.slug) ? 0 : 1;
                    if (aAssigned !== bAssigned) return aAssigned - bAssigned;
                    return (a.display_name || a.name).localeCompare(b.display_name || b.name, "cs");
                  })
                  .map((client) => {
                  const isAssigned = assignedSlugs.includes(client.slug);
                  return (
                    <TableRow key={client.slug} className={`cursor-pointer ${!isAssigned ? "opacity-50" : ""}`} onClick={() => {
                      if (!toggleMutation.isPending) {
                        toggleMutation.mutate({ slug: client.slug, assign: !isAssigned });
                      }
                    }}>
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
        ) : (
          <div className="space-y-6">
            {myClients.length > 0 && (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="p-3 px-4 border-b border-border bg-muted/30">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Moji klienti</p>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent bg-muted/40">
                      <TableHead className="w-[60px]"></TableHead>
                      <TableHead>Klient</TableHead>
                      <TableHead className="text-center">Reklamy</TableHead>
                      <TableHead className="text-right">Poslední poptávka</TableHead>
                      <TableHead className="text-right">Aktivita</TableHead>
                      <TableHead className="text-right text-muted-foreground/60 text-xs font-normal">Nastavení</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {myClients.map((c) => renderRow(c))}
                  </TableBody>
                </Table>
              </div>
            )}

            {otherClients.length > 0 && (
              <Collapsible>
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <CollapsibleTrigger className="w-full p-3 px-4 border-b border-border bg-muted/30 flex items-center gap-2 hover:bg-muted/50 transition-colors cursor-pointer">
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-90" />
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ostatní klienti</p>
                    <span className="text-xs text-muted-foreground/60 ml-1">({otherClients.length})</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent bg-muted/40">
                          <TableHead className="w-[60px]"></TableHead>
                          <TableHead>Klient</TableHead>
                          <TableHead className="text-center">Reklamy</TableHead>
                          <TableHead className="text-right">Poslední poptávka</TableHead>
                          <TableHead className="text-right">Aktivita</TableHead>
                          <TableHead className="text-right text-muted-foreground/60 text-xs font-normal">Nastavení</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {otherClients.map((c) => renderRow(c, true))}
                      </TableBody>
                    </Table>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            )}

            {myClients.length === 0 && otherClients.length === 0 && (
              <p className="text-center text-muted-foreground py-12">Žádní klienti</p>
            )}

            {myClients.length === 0 && otherClients.length > 0 && (
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

      <CreateClientWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}
