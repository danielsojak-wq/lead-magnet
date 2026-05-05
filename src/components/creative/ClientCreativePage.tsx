import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PageSpinner } from "@/components/ui/spinner";
import { Plus, Sparkles, Eye, Palette, FileText, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

interface BriefRow {
  id: string;
  client_slug: string;
  name: string;
  created_at: string;
}

function fmtDate(s: string) {
  try {
    return new Date(s).toLocaleDateString("cs-CZ", { day: "numeric", month: "short", year: "numeric" });
  } catch { return s; }
}

export function ClientCreativePage({ slug, clientName }: { slug: string; clientName: string }) {
  const navigate = useNavigate();

  const { data: briefs, isLoading } = useQuery<BriefRow[]>({
    queryKey: ["creative-briefs", slug],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-creative", {
        body: { action: "list_briefs", client_slugs: [slug] },
      });
      if (error) throw error;
      return data?.briefs || [];
    },
  });

  const { data: brandProfile } = useQuery({
    queryKey: ["creative-brand-profile", slug],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("manage-creative", {
        body: { action: "get_brand_profile", client_slug: slug },
      });
      return data?.profile || null;
    },
    staleTime: 60_000,
  });

  const hasBrandDna = !!(
    brandProfile &&
    (brandProfile.primary_color || brandProfile.tone_of_voice || brandProfile.scraped_data?.source_url)
  );

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        breadcrumbs={[
          { label: "Creative Lab", href: "/creative", icon: Sparkles },
          { label: clientName },
        ]}
      />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ActionCard
            icon={Palette}
            title="Brand DNA"
            description="Nastav identitu značky – barvy, písmo, tone of voice"
            onClick={() => navigate(`/creative/${slug}/brand`)}
            done={hasBrandDna}
          />
          <ActionCard
            icon={Eye}
            title="Konkurenti"
            description="Až 3 konkurenti, AI shrnutí + cross analýza"
            onClick={() => navigate(`/creative/${slug}/competitors`)}
          />
          <ActionCard
            icon={Plus}
            title="Nový brief"
            description="Spusť generování nových kreativ"
            onClick={() => navigate(`/creative/${slug}/new`)}
            primary
          />
        </section>

        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 bg-muted/40 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold">Briefy</h2>
            {briefs && briefs.length > 0 && (
              <span className="text-xs text-muted-foreground">{briefs.length}</span>
            )}
          </div>
          {isLoading ? (
            <div className="py-8"><PageSpinner label="Načítám briefy…" /></div>
          ) : !briefs || briefs.length === 0 ? (
            <div className="px-4 py-12 text-center space-y-3">
              <FileText className="h-8 w-8 mx-auto text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Zatím žádné briefy</p>
              <Button size="sm" className="gap-1.5" onClick={() => navigate(`/creative/${slug}/new`)}>
                <Plus className="h-3.5 w-3.5" /> Vytvořit první brief
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {briefs.map((b) => (
                <li
                  key={b.id}
                  className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => navigate(`/creative/${slug}/brief/${b.id}`)}
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{b.name}</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(b.created_at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function ActionCard({
  icon: Icon,
  title,
  description,
  onClick,
  primary,
  done,
}: {
  icon: typeof Palette;
  title: string;
  description: string;
  onClick: () => void;
  primary?: boolean;
  done?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative text-left rounded-xl border p-4 transition-all hover:shadow-sm ${
        primary
          ? "border-primary/40 bg-primary/5 hover:border-primary hover:bg-primary/10"
          : "border-border bg-card hover:border-primary/40"
      }`}
    >
      {done && (
        <CheckCircle2 className="absolute top-3 right-3 h-4 w-4 text-emerald-500" />
      )}
      <Icon className={`h-5 w-5 mb-2 ${primary ? "text-primary" : "text-muted-foreground"}`} />
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
    </button>
  );
}
