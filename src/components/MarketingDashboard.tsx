import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone, LogOut, ChevronDown, LayoutDashboard, Clock } from "lucide-react";
import { HelpDialog } from "@/components/HelpDialog";
import { LeadCampaignsDialog } from "@/components/LeadCampaignsDialog";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Circle } from "lucide-react";

import { ClientActivityDialog } from "@/components/ClientActivityDialog";
import { ClientLogo } from "@/components/ClientLogo";

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

export function MarketingBar({
  userName,
  clients,
  currentSlug,
  onSwitch,
}: {
  userName: string;
  clients: ClientInfo[];
  currentSlug: string | null;
  onSwitch: (slug: string | null) => void;
}) {
  const navigate = useNavigate();
  const currentClient = currentSlug ? clients.find((c) => c.slug === currentSlug) : null;

  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY);
    navigate("/");
  };

  return (
    <div className="sticky top-0 z-[60] bg-foreground text-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Megaphone className="h-3.5 w-3.5 opacity-70" />
          <span className="text-xs font-medium opacity-70">{userName}</span>
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
              {clients.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  {clients.map((client) => (
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
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-1">
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

export function MarketingOverview({
  clients,
  onSelectClient,
}: {
  clients: ClientInfo[];
  onSelectClient: (slug: string) => void;
}) {
  const { data: rawOverview, isLoading } = useQuery<{ clients: OverviewClient[]; amActivity: Record<string, unknown> }>({
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

  const allClients = overviewData;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[56px] flex items-center justify-between">
          <div className="flex items-center">
            <h1 className="text-sm font-semibold tracking-tight text-foreground">Přehled klientů</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <PageSpinner label="Načítám klienty…" />
        ) : allClients.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">Žádní klienti</p>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-3 px-4 border-b border-border bg-muted/30">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Všichni klienti ({allClients.length})
              </p>
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
                {allClients.map((client) => (
                  <TableRow
                    key={client.slug}
                    className="cursor-pointer"
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
                      <LeadCampaignsDialog clientSlug={client.slug} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6 pt-2 text-center">
        <p className="text-xs text-muted-foreground/60">Developed by Performind</p>
      </footer>
    </div>
  );
}
