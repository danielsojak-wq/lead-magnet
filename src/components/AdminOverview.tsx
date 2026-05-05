import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageSpinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Circle, Plus, Clock } from "lucide-react";
import { ClientSettingsDialog } from "@/components/ClientSettingsDialog";
import { CreateClientWizard } from "@/components/CreateClientWizard";
import { ClientActivityDialog } from "@/components/ClientActivityDialog";
import { ClientLogo } from "@/components/ClientLogo";
import { NotificationSettingsDialog } from "@/components/NotificationSettingsDialog";


const SESSION_KEY = "dashboard_auth";
function getAuthSession() {
  try {
    const s = localStorage.getItem(SESSION_KEY);
    if (!s) return null;
    return JSON.parse(s) as { name: string; isAdmin?: boolean; isAccountManager?: boolean };
  } catch { return null; }
}

interface OverviewClient {
  slug: string;
  name: string;
  adsActive: boolean;
  lastLeadDate: string | null;
  lastLeadDaysAgo: number | null;
  lastActivity: { at: string; description: string | null } | null;
  accountManagers: string[];
}

interface AdminOverviewProps {
  onSelectClient: (slug: string) => void;
  onClientsChange?: (clients: Array<{ slug: string; name: string; display_name: string | null }>) => void;
}

// ClientLogo is now imported from @/components/ClientLogo

function formatRelative(dateStr: string) {
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

function ClientTable({
  clients,
  onSelectClient,
  title,
  amActivity,
  authSession,
}: {
  clients: OverviewClient[];
  onSelectClient: (slug: string) => void;
  title: string;
  amActivity?: { at: string; description: string | null } | null;
  authSession: { name: string; isAdmin?: boolean; isAccountManager?: boolean } | null;
}) {
  if (clients.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 bg-muted/40 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {amActivity && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatRelative(amActivity.at)}
          </span>
        )}
      </div>
      <Table>
        <colgroup>
          <col className="w-[60px]" />
          <col />
          <col className="w-[140px]" />
          <col className="w-[180px]" />
          <col className="w-[160px]" />
          <col className="w-[48px]" />
          <col className="w-[48px]" />
        </colgroup>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead></TableHead>
            <TableHead className="text-xs font-medium">Klient</TableHead>
            <TableHead className="text-center text-xs font-medium">Reklamy</TableHead>
            <TableHead className="text-right text-xs font-medium">Poslední poptávka</TableHead>
            <TableHead className="text-right text-xs font-medium">Poslední aktivita</TableHead>
            <TableHead></TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((client) => (
            <TableRow
              key={client.slug}
              className="cursor-pointer"
              onClick={() => onSelectClient(client.slug)}
            >
              <TableCell className="py-3">
                <ClientLogo slug={client.slug} name={client.name} />
              </TableCell>
              <TableCell className="text-sm font-medium">{client.name}</TableCell>
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
              <TableCell className="text-right text-sm text-muted-foreground">
                {client.lastLeadDaysAgo !== null
                  ? client.lastLeadDaysAgo === 0
                    ? "Dnes"
                    : client.lastLeadDaysAgo === 1
                      ? "Včera"
                      : `před ${client.lastLeadDaysAgo} dny`
                  : "—"
                }
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
                {authSession && (
                  <NotificationSettingsDialog
                    clientSlug={client.slug}
                    clientName={client.name}
                    userType={authSession.isAdmin ? "admin" : "am"}
                    userId={authSession.name}
                    userDisplayName={authSession.name}
                  />
                )}
              </TableCell>
              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                <ClientSettingsDialog clientSlug={client.slug} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function AdminOverview({ onSelectClient, onClientsChange }: AdminOverviewProps) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const authSession = getAuthSession();
  const { data: rawData, isLoading, error } = useQuery<{ clients: OverviewClient[]; amActivity: Record<string, { at: string; description: string | null }> }>({
    queryKey: ["admin-overview"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("fetch-admin-overview");
      if (error) throw error;
      // Handle both old (array) and new (object) response formats
      if (Array.isArray(data)) return { clients: data, amActivity: {} };
      return data;
    },
    staleTime: 60_000,
  });

  const clients = rawData?.clients;
  const amActivity = rawData?.amActivity || {};

  useEffect(() => {
    if (!clients || !onClientsChange) return;
    onClientsChange(
      clients.map((client) => ({
        slug: client.slug,
        name: client.name,
        display_name: client.name,
      }))
    );
  }, [clients, onClientsChange]);

  // Group clients by AM
  const grouped = (() => {
    if (!clients) return [];
    const amMap = new Map<string, OverviewClient[]>();
    const unassigned: OverviewClient[] = [];

    for (const client of clients) {
      if (client.accountManagers.length === 0) {
        unassigned.push(client);
      } else {
        for (const am of client.accountManagers) {
          const arr = amMap.get(am) || [];
          arr.push(client);
          amMap.set(am, arr);
        }
      }
    }

    const sections: { title: string; clients: OverviewClient[] }[] = [];
    const amNames = [...amMap.keys()].sort();
    for (const name of amNames) {
      const sorted = amMap.get(name)!.slice().sort((a, b) => a.name.localeCompare(b.name, "cs"));
      sections.push({ title: name, clients: sorted });
    }
    if (unassigned.length > 0) {
      sections.push({ title: "Nepřiřazení", clients: unassigned.slice().sort((a, b) => a.name.localeCompare(b.name, "cs")) });
    }
    return sections;
  })();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:h-[56px] flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0 justify-between">
          <div className="flex items-center">
            <h1 className="text-sm font-semibold tracking-tight text-foreground">Přehled klientů</h1>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 w-full sm:w-auto" onClick={() => setWizardOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Nový klient
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {error && (
          <div className="text-center space-y-2 py-12">
            <p className="text-destructive font-medium">Chyba při načítání přehledu</p>
            <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
          </div>
        )}

        {isLoading ? (
          <PageSpinner label="Načítám klienty…" />
        ) : grouped.length > 0 ? (
          grouped.map((section) => (
            <ClientTable
              key={section.title}
              title={section.title}
              clients={section.clients}
              onSelectClient={onSelectClient}
              amActivity={amActivity[section.title]}
              authSession={authSession}
            />
          ))
        ) : (
          <p className="text-center text-muted-foreground py-12">Žádní klienti</p>
        )}
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6 pt-2 text-center">
        <p className="text-xs text-muted-foreground/60">Developed by Performind</p>
      </footer>

      <CreateClientWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}
