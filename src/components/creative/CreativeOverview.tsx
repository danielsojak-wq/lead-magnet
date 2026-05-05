import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PageSpinner } from "@/components/ui/spinner";
import { ClientLogo } from "@/components/ClientLogo";
import { Plus, Sparkles, Eye, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

interface ClientInfo {
  slug: string;
  display_name: string | null;
  name: string;
}

interface BriefRow {
  id: string;
  client_slug: string;
  name: string;
  created_at: string;
}

interface Props {
  clients: ClientInfo[];
  amId?: string | null;
  isAdmin?: boolean;
}

interface HubClient {
  slug: string;
  name: string;
  display_name: string | null;
  modules: {
    leadgen: boolean;
    ecommerce: boolean;
    marketing: boolean;
    creative_brand: boolean;
    creative_briefs: number;
  };
}

function fmtDate(s: string) {
  try {
    const d = new Date(s);
    return d.toLocaleDateString("cs-CZ", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return s;
  }
}

export function CreativeOverview({ clients, amId, isAdmin }: Props) {
  const navigate = useNavigate();

  // Fetch full client list with module status; show clients that have leadgen or ecommerce.
  const { data: hubClients } = useQuery<HubClient[]>({
    queryKey: ["creative-hub-clients", isAdmin ? "admin" : amId || "none"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("fetch-clients-hub", {
        body: isAdmin ? {} : { am_id: amId },
      });
      if (error) throw error;
      const all: HubClient[] = data?.clients || [];
      return all.filter((c) => c.modules.leadgen || c.modules.ecommerce);
    },
    staleTime: 30_000,
  });

  const sorted = (hubClients || []).slice().sort((a, b) =>
    (a.display_name || a.name).localeCompare(b.display_name || b.name, "cs")
  );

  const { data: briefs, isLoading } = useQuery<BriefRow[]>({
    queryKey: ["creative-briefs", sorted.map(c => c.slug).join(",")],
    queryFn: async () => {
      if (sorted.length === 0) return [];
      const { data, error } = await supabase.functions.invoke("manage-creative", {
        body: { action: "list_briefs", client_slugs: sorted.map(c => c.slug) },
      });
      if (error) throw error;
      return data?.briefs || [];
    },
    staleTime: 30_000,
  });

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        maxWidth="max-w-7xl"
        breadcrumbs={[{ label: "Creative Lab", icon: Sparkles }]}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 bg-muted/40 border-b border-border">
            <h2 className="text-sm font-semibold">Klienti</h2>
          </div>
          {sorted.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted-foreground text-center">Žádní klienti</p>
          ) : (
            <ul className="divide-y divide-border">
              {sorted.map((c) => (
                <li
                  key={c.slug}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors group"
                  onClick={() => navigate(`/creative/${c.slug}`)}
                >
                  <ClientLogo slug={c.slug} name={c.display_name || c.name} />
                  <div className="flex-1 text-sm font-medium">{c.display_name || c.name}</div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/creative/${c.slug}/brand`)}>
                      Brand DNA
                    </Button>
                    <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate(`/creative/${c.slug}/competitors`)}>
                      <Eye className="h-3.5 w-3.5" /> Konkurenti
                    </Button>
                    <Button size="sm" className="gap-1.5" onClick={() => navigate(`/creative/${c.slug}/new`)}>
                      <Plus className="h-3.5 w-3.5" /> Nový brief
                    </Button>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 bg-muted/40 border-b border-border">
            <h2 className="text-sm font-semibold">Poslední briefy</h2>
          </div>
          {isLoading ? (
            <div className="py-8"><PageSpinner label="Načítám briefy…" /></div>
          ) : !briefs || briefs.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted-foreground text-center">Zatím žádné briefy</p>
          ) : (
            <ul className="divide-y divide-border">
              {briefs.map((b) => {
                const c = sorted.find((x) => x.slug === b.client_slug);
                return (
                  <li
                    key={b.id}
                    className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-muted/30"
                    onClick={() => navigate(`/creative/${b.client_slug}/brief/${b.id}`)}
                  >
                    <div className="flex-1">
                      <div className="text-sm font-medium">{b.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {(c?.display_name || c?.name || b.client_slug)} · {fmtDate(b.created_at)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6 pt-2 text-center">
        <p className="text-xs text-muted-foreground/60">Developed by Performind</p>
      </footer>
    </div>
  );
}