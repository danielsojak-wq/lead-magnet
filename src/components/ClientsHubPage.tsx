import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ClientLogo } from "@/components/ClientLogo";
import { ClientSettingsDialog } from "@/components/ClientSettingsDialog";
import { CreateClientWizard } from "@/components/CreateClientWizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageSpinner } from "@/components/ui/spinner";
import { BarChart3, ShoppingCart, Sparkles, Users, Search, Plus } from "lucide-react";

interface HubClient {
  slug: string;
  name: string;
  display_name: string | null;
  accountManagers: string[];
  modules: {
    leadgen: boolean;
    ecommerce: boolean;
    marketing: boolean;
    creative_brand: boolean;
    creative_briefs: number;
  };
}

interface Props {
  amId?: string;
  role: "admin" | "am";
}

function ModuleBadge({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof BarChart3;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  if (!active) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground/40 select-none">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary hover:text-white transition-all duration-150"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

export function ClientsHubPage({ amId, role }: Props) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<"alpha" | "am">("alpha");
  const [wizardOpen, setWizardOpen] = useState(false);

  const { data, isLoading } = useQuery<{ clients: HubClient[] }>({
    queryKey: ["clients-hub", amId || "admin"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("fetch-clients-hub", {
        body: amId ? { am_id: amId } : {},
      });
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <PageSpinner label="Načítám klienty…" />;

  const allClients = (data?.clients || []).slice().sort((a, b) =>
    (a.display_name || a.name).localeCompare(b.display_name || b.name, "cs", { sensitivity: "base" })
  );
  const clients = search.trim()
    ? allClients.filter((c) => {
        const q = search.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.display_name?.toLowerCase() ?? "").includes(q) ||
          c.slug.toLowerCase().includes(q)
        );
      })
    : allClients;

  // Group by AM (only for admin)
  const grouped: { title: string; clients: HubClient[] }[] | null = (() => {
    if (role !== "admin" || groupBy !== "am") return null;
    const amMap = new Map<string, HubClient[]>();
    const unassigned: HubClient[] = [];
    for (const c of clients) {
      const ams = c.accountManagers || [];
      if (ams.length === 0) {
        unassigned.push(c);
      } else {
        for (const am of ams) {
          const arr = amMap.get(am) || [];
          arr.push(c);
          amMap.set(am, arr);
        }
      }
    }
    const sections: { title: string; clients: HubClient[] }[] = [];
    const amNames = [...amMap.keys()].sort((a, b) => a.localeCompare(b, "cs"));
    for (const name of amNames) {
      sections.push({ title: name, clients: amMap.get(name)! });
    }
    if (unassigned.length > 0) {
      sections.push({ title: "Nepřiřazení", clients: unassigned });
    }
    return sections;
  })();

  const renderClientList = (list: HubClient[]) => (
    <ul className="divide-y divide-border/60">
      {list.map((c) => {
        const name = c.display_name || c.name;
        const creativeActive = c.modules.creative_brand || c.modules.creative_briefs > 0;
        return (
          <li
            key={c.slug}
            className="group grid grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)_36px] gap-4 px-5 py-3.5 items-center hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <ClientLogo
                slug={c.slug}
                name={name}
                className="h-9 w-9 object-contain rounded-lg shrink-0"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{name}</p>
                <p className="text-[11px] text-muted-foreground truncate">{c.slug}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <ModuleBadge
                icon={BarChart3}
                label="Leadgen"
                active={c.modules.leadgen}
                onClick={() => navigate(`/leadgen/${c.slug}/dashboard`)}
              />
              <ModuleBadge
                icon={ShoppingCart}
                label="Ecommerce"
                active={c.modules.ecommerce}
                onClick={() => navigate(`/ecommerce/${c.slug}`)}
              />
              <ModuleBadge
                icon={Sparkles}
                label="Creative Lab"
                active={creativeActive}
                onClick={() => navigate(`/creative/${c.slug}`)}
              />
            </div>
            <div
              className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              {role === "admin" && <ClientSettingsDialog clientSlug={c.slug} />}
            </div>
          </li>
        );
      })}
    </ul>
  );

  const columnHeaders = (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)_36px] gap-4 px-5 py-2.5 border-b border-border bg-muted/20 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
      <div>Klient</div>
      <div>Moduly</div>
      <div />
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border/50">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-4">
          <div className="flex items-center gap-2 flex-shrink-0">
            <Users className="h-4 w-4 text-primary" />
            <h1 className="text-sm font-semibold">Klienti</h1>
            <span className="text-xs text-muted-foreground tabular-nums">{allClients.length}</span>
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Hledat klienta…"
              className="pl-8 h-8 text-xs bg-muted/40 border-0 focus-visible:ring-1"
            />
          </div>
          {role === "admin" && (
            <div className="flex items-center gap-2 ml-auto flex-shrink-0">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setGroupBy("alpha")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    groupBy === "alpha"
                      ? "bg-primary text-white"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  A–Z
                </button>
                <button
                  type="button"
                  onClick={() => setGroupBy("am")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    groupBy === "am"
                      ? "bg-primary text-white"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  Podle AM
                </button>
              </div>
              <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setWizardOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Nový klient
              </Button>
            </div>
          )}
        </div>
      </header>

      <CreateClientWizard open={wizardOpen} onOpenChange={setWizardOpen} />

      {/* List */}
      <main className="max-w-5xl mx-auto px-6 py-6">
        {clients.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-16">
            {search ? "Žádný klient neodpovídá hledání." : "Zatím nejsou založeni žádní klienti."}
          </p>
        ) : grouped ? (
          <div className="space-y-4">
            {grouped.map((section) => (
              <div key={section.title} className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-2.5 bg-muted/30 border-b border-border flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">{section.title}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">{section.clients.length}</span>
                </div>
                {columnHeaders}
                {renderClientList(section.clients)}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {columnHeaders}
            {renderClientList(clients)}
          </div>
        )}
      </main>
    </div>
  );
}
