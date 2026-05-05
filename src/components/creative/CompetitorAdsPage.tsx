import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageSpinner } from "@/components/ui/spinner";
import { RefreshCw, Play, Sparkles, Plus, Trash2, Globe, Megaphone, TrendingUp, Layers, Pencil, Check, X, Users, Loader2, Image as ImageIcon, Video, FileText, Zap, Telescope, Download, CheckCircle2, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { HeroPanel } from "@/components/ui/hero-panel";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";

interface Competitor {
  id: string;
  client_slug: string;
  slot: number;
  name: string;
  meta_library_url: string | null;
  website_url: string | null;
}

interface CompetitorAd {
  id: string;
  ad_archive_id: string | null;
  page_name: string | null;
  image_url: string | null;
  video_url: string | null;
  primary_text: string | null;
  ad_start_date: string | null;
  ad_end_date: string | null;
  is_active: boolean;
  link_url: string | null;
  cta_text: string | null;
  ad_type: string | null;
  is_inspiration?: boolean;
  competitor_id: string | null;
}

interface ScrapeRun {
  id: string;
  library_url: string;
  status: string;
  ads_count: number;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
  competitor_id: string | null;
}

interface InsightRow {
  id: string;
  competitor_id: string | null;
  insight_type: "brand" | "sales" | "cross_brand" | "cross_sales" | "competitor_summary" | "cross_summary";
  summary: string | null;
  ads_count: number;
  videos_count: number;
  images_count: number;
  status: "idle" | "processing" | "ready" | "failed" | "empty";
  error_message: string | null;
  generated_at: string | null;
}

interface WebCacheRow {
  scraped_at: string;
  summary: string | null;
  url: string;
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const start = new Date(dateStr + "T00:00:00").getTime();
  if (isNaN(start)) return null;
  return Math.max(0, Math.floor((Date.now() - start) / 86_400_000));
}
function fmt(dateStr: string | null) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("cs-CZ", { day: "numeric", month: "short", year: "numeric" });
  } catch { return dateStr; }
}
function fmtDateTime(s: string) {
  try { return new Date(s).toLocaleString("cs-CZ", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return s; }
}
function ageColor(days: number | null) {
  if (days === null) return "bg-background text-foreground border border-border";
  if (days >= 90) return "bg-[#b0f221] text-black border border-[#b0f221]";
  if (days >= 30) return "bg-primary text-primary-foreground border border-primary";
  return "bg-background text-foreground border border-border";
}

interface Props { slug: string; clientName: string; }

export function CompetitorAdsPage({ slug, clientName }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selectedCompetitorId, setSelectedCompetitorId] = useState<string | "all">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "brand" | "sales" | "retargeting" | "inspiration">("all");
  const [analyzeDialog, setAnalyzeDialog] = useState<{ competitor: Competitor | null; maxAds: number }>({ competitor: null, maxAds: 25 });
  const [runsOpen, setRunsOpen] = useState(false);
  const [analyzingCompetitorId, setAnalyzingCompetitorId] = useState<string | null>(null);

  // Insights & competitors (single source via manage-creative)
  const insightsQuery = useQuery<{
    competitors: Competitor[];
    insights: InsightRow[];
    ads_by_competitor: Record<string, number>;
    total_ads: number;
    web_by_competitor: Record<string, WebCacheRow>;
  }>({
    queryKey: ["competitor-insights-v2", slug],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-creative", {
        body: { action: "get_competitor_insights", client_slug: slug },
      });
      if (error) throw error;
      return data;
    },
    refetchInterval: (q) => {
      const d = q.state.data as { insights?: InsightRow[] } | undefined;
      return (d?.insights || []).some((i) => i.status === "processing") ? 4000 : false;
    },
  });

  const competitors = insightsQuery.data?.competitors || [];
  const insights = insightsQuery.data?.insights || [];
  const adsByCompetitor = insightsQuery.data?.ads_by_competitor || {};
  const webByCompetitor = insightsQuery.data?.web_by_competitor || {};

  // Ads (filtered server-side by competitor when chosen)
  const { data: adsData, isLoading: adsLoading, refetch: refetchAds } = useQuery<{ ads: CompetitorAd[]; runs: ScrapeRun[] }>({
    queryKey: ["competitor-ads", slug, selectedCompetitorId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("scrape-competitor-ads", {
        body: { action: "list", client_slug: slug, competitor_id: selectedCompetitorId === "all" ? undefined : selectedCompetitorId },
      });
      if (error) throw error;
      return data;
    },
    refetchOnWindowFocus: false,
    refetchInterval: () => (analyzingCompetitorId ? 5000 : false),
  });

  const openAnalyzeDialog = (competitor: Competitor) => {
    if (!competitor.meta_library_url) {
      toast.error(`Konkurent ${competitor.name}: chybí Meta Ad Library URL`);
      return;
    }
    setAnalyzeDialog({ competitor, maxAds: 25 });
  };

  const runFullAnalysis = async () => {
    const c = analyzeDialog.competitor;
    if (!c) return;
    const max = analyzeDialog.maxAds;
    setAnalyzeDialog({ competitor: null, maxAds: 25 });
    setAnalyzingCompetitorId(c.id);
    const { error } = await supabase.functions.invoke("manage-creative", {
      body: { action: "analyze_competitor", client_slug: slug, competitor_id: c.id, max_ads: max },
    });
    if (error) {
      toast.error("Analýza selhala: " + error.message);
      setAnalyzingCompetitorId(null);
      return;
    }
    toast.success(`Analyzuji ${c.name} (${max} aktivních reklam)…`);
    qc.invalidateQueries({ queryKey: ["competitor-insights-v2", slug] });
  };

  const regenerateCrossOnly = async () => {
    const { error } = await supabase.functions.invoke("manage-creative", {
      body: { action: "regenerate_competitor_insights", client_slug: slug },
    });
    if (error) { toast.error("Generování selhalo: " + error.message); return; }
    toast.success("Generuji průnik napříč konkurencí…");
    qc.invalidateQueries({ queryKey: ["competitor-insights-v2", slug] });
  };

  const toggleInspiration = async (ad: CompetitorAd) => {
    const next = !ad.is_inspiration;
    qc.setQueryData<{ ads: CompetitorAd[]; runs: ScrapeRun[] }>(["competitor-ads", slug, selectedCompetitorId], (old) =>
      old ? { ...old, ads: old.ads.map((a) => (a.id === ad.id ? { ...a, is_inspiration: next } : a)) } : old
    );
    const { error } = await supabase.functions.invoke("scrape-competitor-ads", {
      body: { action: "set_inspiration", ad_id: ad.id, is_inspiration: next },
    });
    if (error) {
      toast.error("Nepodařilo se uložit");
      qc.invalidateQueries({ queryKey: ["competitor-ads", slug, selectedCompetitorId] });
    } else {
      toast.success(next ? "Přidáno do inspirací" : "Odebráno z inspirací");
    }
  };

  const allAds = (adsData?.ads || []).slice().sort((a, b) => {
    const da = a.ad_start_date || "9999-12-31";
    const db = b.ad_start_date || "9999-12-31";
    return da.localeCompare(db);
  });
  const ads = useMemo(() => {
    if (typeFilter === "all") return allAds;
    if (typeFilter === "inspiration") return allAds.filter((a) => a.is_inspiration);
    return allAds.filter((a) => a.ad_type === typeFilter);
  }, [allAds, typeFilter]);
  const counts = {
    all: allAds.length,
    brand: allAds.filter((a) => a.ad_type === "brand").length,
    sales: allAds.filter((a) => a.ad_type === "sales").length,
    retargeting: allAds.filter((a) => a.ad_type === "retargeting").length,
    inspiration: allAds.filter((a) => a.is_inspiration).length,
  };

  const anyProcessing = insights.some((i) => i.status === "processing");
  // Clear local "analyzing" flag once insight reaches a terminal state
  useEffect(() => {
    if (!analyzingCompetitorId) return;
    const ins = insights.find((i) => i.competitor_id === analyzingCompetitorId && i.insight_type === "competitor_summary");
    if (ins && ins.status !== "processing") setAnalyzingCompetitorId(null);
  }, [insights, analyzingCompetitorId]);

  const competitorById = (id: string) => competitors.find((c) => c.id === id);
  const summaryFor = (competitorId: string) =>
    insights.find((i) => i.competitor_id === competitorId && i.insight_type === "competitor_summary");
  const crossSummary = insights.find((i) => i.competitor_id === null && i.insight_type === "cross_summary");
  const lastGenerated = (() => {
    const dates = insights
      .filter((i) => i.insight_type === "competitor_summary" || i.insight_type === "cross_summary")
      .map((i) => i.generated_at)
      .filter(Boolean) as string[];
    if (dates.length === 0) return null;
    return dates.sort().reverse()[0];
  })();

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        maxWidth="max-w-7xl"
        breadcrumbs={[
          { label: "Creative Lab", href: "/creative", icon: Sparkles },
          { label: clientName, href: `/creative/${slug}` },
          { label: "Konkurenční reklamy" },
        ]}
        actions={
          <Button variant="ghost" size="sm" onClick={() => { refetchAds(); insightsQuery.refetch(); }} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Obnovit
          </Button>
        }
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Konkurenti — kompaktní lišta */}
        <CompetitorBar
          slug={slug}
          competitors={competitors}
          adsByCompetitor={adsByCompetitor}
          analyzingCompetitorId={analyzingCompetitorId}
          insights={insights}
          onAnalyze={openAnalyzeDialog}
          onChange={() => {
            qc.invalidateQueries({ queryKey: ["competitor-insights-v2", slug] });
            qc.invalidateQueries({ queryKey: ["competitor-ads", slug] });
          }}
        />

        {competitors.length === 0 ? (
          <EmptyPlaceholder
            icon={Telescope}
            title="Zatím tu není žádný konkurent"
            description="Přidej až 3 konkurenty výše — Meta Ad Library URL pro reklamy a web pro AI kontext. Pak spusť scrape a vygeneruj shrnutí."
          />
        ) : (
          <>
            {/* HERO — Průniky napříč konkurencí */}
            <HeroPanel
              icon={Layers}
              title="Průnik napříč konkurencí"
              subtitle={lastGenerated ? `Naposledy: ${fmtDateTime(lastGenerated)} · ${competitors.length} konkurentů · ${insightsQuery.data?.total_ads || 0} reklam` : "Co dělají všichni stejně — co obecně funguje"}
              actions={competitors.length >= 2 ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={anyProcessing}
                  onClick={regenerateCrossOnly}
                  className="gap-1.5"
                >
                  {anyProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  {crossSummary?.summary ? "Přegenerovat průnik" : "Vygenerovat průnik"}
                </Button>
              ) : undefined}
            >
              {competitors.length >= 2 ? (
                <SummaryCard insight={crossSummary} highlight />
              ) : (
                <div className="rounded-xl bg-background/50 backdrop-blur-sm border border-border/50 p-4 text-center text-xs text-muted-foreground">
                  <Users className="h-5 w-5 mx-auto mb-2 text-muted-foreground/60" />
                  Přidej alespoň 2 konkurenty pro porovnání průniků
                </div>
              )}
            </HeroPanel>

            {/* Per-competitor — Tabs */}
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold">Souhrn za jednotlivé konkurenty</h2>
                <p className="text-xs text-muted-foreground">Jak každý konkurent využívá kreativy a textace</p>
              </div>
              <Tabs defaultValue={competitors[0]?.id} className="space-y-3">
                <TabsList className="h-auto p-1 bg-muted/50 flex-wrap justify-start">
                  {competitors.map((c) => (
                    <TabsTrigger key={c.id} value={c.id} className="gap-2 text-xs data-[state=active]:bg-background">
                      <span className="inline-flex items-center justify-center h-4 w-4 rounded bg-primary/15 text-primary text-[9px] font-semibold">{c.slot}</span>
                      {c.name}
                      <span className="text-[10px] text-muted-foreground">({adsByCompetitor[c.id] || 0})</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
                {competitors.map((c) => {
                  const web = webByCompetitor[c.id];
                  return (
                    <TabsContent key={c.id} value={c.id} className="mt-3 space-y-3">
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {c.website_url && (
                          <div className="inline-flex items-center gap-1.5">
                            <Globe className="h-3 w-3" />
                            <a href={c.website_url} target="_blank" rel="noreferrer" className="hover:text-primary truncate">
                              {c.website_url.replace(/^https?:\/\//, "")}
                            </a>
                          </div>
                        )}
                        {web && (
                          <span className="inline-flex items-center gap-1 text-[#b0f221]">
                            <CheckCircle2 className="h-3 w-3" /> Web načten {fmtDateTime(web.scraped_at)}
                          </span>
                        )}
                      </div>
                      <SummaryCard insight={summaryFor(c.id)} />
                    </TabsContent>
                  );
                })}
              </Tabs>
            </section>
          </>
        )}

        {/* Poslední běhy — sbalitelné */}
        {adsData?.runs && adsData.runs.length > 0 && (
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <button
              type="button"
              onClick={() => setRunsOpen((v) => !v)}
              className="w-full px-4 py-3 bg-muted/40 border-b border-border flex items-center gap-2 hover:bg-muted/60 transition-colors"
            >
              {runsOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              <h2 className="text-sm font-semibold">Poslední běhy scrapingu</h2>
              <span className="text-[11px] text-muted-foreground">· {adsData.runs.length}</span>
            </button>
            {runsOpen && (
              <ul className="divide-y divide-border text-sm">
                {adsData.runs.slice(0, 8).map((r) => {
                  const c = r.competitor_id ? competitorById(r.competitor_id) : null;
                  return (
                    <li key={r.id} className="px-4 py-2 flex items-center gap-3">
                      <span className={`inline-block h-2 w-2 rounded-full ${
                        r.status === "succeeded" ? "bg-[#b0f221]" :
                        r.status === "failed" ? "bg-red-500" : "bg-primary animate-pulse"
                      }`} />
                      <span className="text-xs font-medium min-w-[80px]">{c?.name || "—"}</span>
                      <span className="truncate flex-1 text-xs text-muted-foreground">{r.library_url}</span>
                      <span className="text-xs">{r.ads_count} reklam</span>
                      <span className="text-xs text-muted-foreground">{new Date(r.started_at).toLocaleString("cs-CZ")}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {/* Reklamy */}
        <section>
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <h2 className="text-sm font-semibold">Reklamy ({ads.length}) · řazeno od nejstarší</h2>
            {competitors.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <FilterPill active={selectedCompetitorId === "all"} onClick={() => setSelectedCompetitorId("all")}>
                  Všichni <span className="opacity-60">({insightsQuery.data?.total_ads || 0})</span>
                </FilterPill>
                {competitors.map((c) => (
                  <FilterPill key={c.id} active={selectedCompetitorId === c.id} onClick={() => setSelectedCompetitorId(c.id)}>
                    {c.name} <span className="opacity-60">({adsByCompetitor[c.id] || 0})</span>
                  </FilterPill>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {([
              ["all", "Vše"], ["brand", "Brand"], ["sales", "Sales"],
              ["retargeting", "Retargeting"], ["inspiration", "Inspirace"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTypeFilter(key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  typeFilter === key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                {label} <span className="opacity-60">({counts[key]})</span>
              </button>
            ))}
          </div>
          {adsLoading ? (
            <PageSpinner label="Načítám reklamy…" />
          ) : ads.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/30 px-4 py-12 text-center text-sm text-muted-foreground">
              Žádné reklamy.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {ads.map((ad) => {
                const days = daysSince(ad.ad_start_date);
                const c = ad.competitor_id ? competitorById(ad.competitor_id) : null;
                return (
                  <article key={ad.id} className={`rounded-xl border bg-card overflow-hidden flex flex-col transition-colors ${ad.is_inspiration ? "border-primary ring-1 ring-primary/40" : "border-border"}`}>
                    <div className="aspect-square bg-muted/40 relative overflow-hidden">
                      {ad.video_url ? (
                        <video src={ad.video_url} poster={ad.image_url || undefined} controls playsInline preload="metadata" className="w-full h-full object-cover bg-black" />
                      ) : ad.image_url ? (
                        <img src={ad.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">bez náhledu</div>
                      )}
                      <div className={`absolute top-2 left-2 px-2 py-1 rounded-md text-xs font-semibold shadow-md pointer-events-none ${ageColor(days)}`}>
                        {days === null ? "—" : `${days} dní`}
                      </div>
                      {ad.is_active && (
                        <div className="absolute top-2 right-2 px-2 py-1 rounded-md text-xs font-semibold bg-background border border-border flex items-center gap-1 shadow-md pointer-events-none">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#b0f221]" /> Aktivní
                        </div>
                      )}
                    </div>
                    <div className="p-3 space-y-2 flex-1 flex flex-col">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold truncate">{c?.name || ad.page_name || "—"}</div>
                        {ad.ad_type && (
                          <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-md border whitespace-nowrap ${
                            ad.ad_type === "brand" ? "bg-primary/15 text-primary border-primary/30" :
                            ad.ad_type === "sales" ? "bg-[#b0f221]/15 text-[#b0f221] border-[#b0f221]/30" :
                            "bg-orange-500/15 text-orange-400 border-orange-500/30"
                          }`}>
                            {ad.ad_type}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-3 flex-1">{ad.primary_text || "—"}</p>
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                        <span className="text-muted-foreground">Od {fmt(ad.ad_start_date)}</span>
                        {ad.link_url && (
                          <a href={ad.link_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                            Odkaz
                          </a>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleInspiration(ad)}
                        className={`mt-1 w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                          ad.is_inspiration
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card text-muted-foreground border-border hover:text-foreground hover:border-primary/50"
                        }`}
                      >
                        <Sparkles className="h-3 w-3" />
                        {ad.is_inspiration ? "V inspiracích" : "Použít jako inspiraci"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <Dialog open={!!analyzeDialog.competitor} onOpenChange={(o) => { if (!o) setAnalyzeDialog({ competitor: null, maxAds: 25 }); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Analyzovat {analyzeDialog.competitor?.name}</DialogTitle>
            <DialogDescription className="text-xs">
              Nascrapuje aktivní reklamy z Meta Ad Library, načte web konkurence a vygeneruje souhrn.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium">Počet aktivních reklam</label>
                <span className="text-sm font-semibold tabular-nums">{analyzeDialog.maxAds}</span>
              </div>
              <Slider
                value={[analyzeDialog.maxAds]}
                min={10} max={100} step={5}
                onValueChange={(v) => setAnalyzeDialog((s) => ({ ...s, maxAds: v[0] }))}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>10</span><span>50</span><span>100</span>
              </div>
            </div>
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 flex gap-2 text-[11px] text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <div>
                <strong>Pozor na náklady.</strong> Více reklam = vyšší cena za scrape (Apify) i AI klasifikaci s obrázkem/videem. Doporučujeme 20–30 reklam pro běžný přehled, 50+ jen u silně aktivních značek.
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnalyzeDialog({ competitor: null, maxAds: 25 })}>Zrušit</Button>
            <Button onClick={runFullAnalysis} className="gap-1.5"><Zap className="h-3.5 w-3.5" /> Spustit analýzu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
      active ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:text-foreground"
    }`}>{children}</button>
  );
}

function MarkdownBullets({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const renderInline = (s: string) => {
    const parts = s.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) =>
      p.startsWith("**") && p.endsWith("**")
        ? <strong key={i} className="text-foreground font-semibold">{p.slice(2, -2)}</strong>
        : <span key={i}>{p}</span>
    );
  };
  return (
    <ul className="space-y-1.5 text-xs text-foreground/90 leading-relaxed">
      {lines.map((l, i) => {
        const clean = l.replace(/^[-*•]\s*/, "");
        return (
          <li key={i} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 rounded-full bg-primary shrink-0" />
            <span>{renderInline(clean)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function SummaryCard({ insight, highlight }: { insight: InsightRow | undefined; highlight?: boolean }) {
  const status = insight?.status || "idle";
  const wrap = `rounded-xl border p-4 ${highlight ? "border-border/60 bg-background/70 backdrop-blur-sm shadow-sm" : "border-border bg-card/50"}`;
  if (status === "processing") {
    return (
      <div className={wrap}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> Analyzuji reklamy a web…
        </div>
        <Progress value={undefined as unknown as number} className="h-1 [&>div]:animate-pulse [&>div]:bg-primary" />
      </div>
    );
  }
  if (status === "failed") {
    return <div className={wrap}><p className="text-xs text-destructive">{insight?.error_message || "neznámá chyba"}</p></div>;
  }
  if (status === "empty" || !insight?.summary) {
    return (
      <div className={wrap}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground/80">
          <Sparkles className="h-3.5 w-3.5" />
          {status === "empty" ? "Žádná data k analýze" : "Čeká na vygenerování souhrnu"}
        </div>
      </div>
    );
  }

  // Parse markdown se sekcemi ### Sekce
  const sections: { title: string; body: string }[] = [];
  const parts = insight.summary.split(/^###\s+/m).filter((p) => p.trim());
  if (parts.length > 0 && /^###\s+/m.test(insight.summary)) {
    for (const p of parts) {
      const nl = p.indexOf("\n");
      const title = (nl === -1 ? p : p.slice(0, nl)).trim();
      const body = nl === -1 ? "" : p.slice(nl + 1).trim();
      sections.push({ title, body });
    }
  } else {
    sections.push({ title: "", body: insight.summary });
  }

  return (
    <div className={wrap + " space-y-4"}>
      {sections.map((s, i) => (
        <div key={i}>
          {s.title && <h4 className="text-xs font-semibold uppercase tracking-wide text-primary mb-2">{s.title}</h4>}
          <MarkdownBullets text={s.body} />
        </div>
      ))}
      {insight.generated_at && (
        <div className="text-[10px] text-muted-foreground/70 pt-2 border-t border-border/30 flex items-center gap-3">
          <span>Aktualizováno {fmtDateTime(insight.generated_at)}</span>
          {insight.ads_count > 0 && (
            <span className="inline-flex items-center gap-2">
              <span className="inline-flex items-center gap-0.5"><FileText className="h-2.5 w-2.5" />{insight.ads_count}</span>
              <span className="inline-flex items-center gap-0.5"><Video className="h-2.5 w-2.5" />{insight.videos_count}</span>
              <span className="inline-flex items-center gap-0.5"><ImageIcon className="h-2.5 w-2.5" />{insight.images_count}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyPlaceholder({ icon: Icon, title, description }: { icon: typeof Megaphone; title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-12 text-center flex flex-col items-center gap-3">
      <span className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-7 w-7" />
      </span>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-xs text-muted-foreground max-w-md">{description}</p>
    </div>
  );
}

function InsightCard({ title, icon: Icon, accent, insight, highlight }: { title: string; icon: typeof Megaphone; accent: string; insight: InsightRow | undefined; highlight?: boolean }) {
  const status = insight?.status || "idle";
  return (
    <div className={`rounded-xl border p-3 flex flex-col gap-2 min-h-[140px] ${highlight ? "border-border/60 bg-background/70 backdrop-blur-sm shadow-sm" : "border-border bg-card/50"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center justify-center h-6 w-6 rounded-md ${accent}`}>
            <Icon className="h-3 w-3" />
          </span>
          <h4 className="text-xs font-semibold">{title}</h4>
        </div>
        {insight && insight.ads_count > 0 && (
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-0.5"><FileText className="h-2.5 w-2.5" />{insight.ads_count}</span>
            <span className="inline-flex items-center gap-0.5"><Video className="h-2.5 w-2.5" />{insight.videos_count}</span>
            <span className="inline-flex items-center gap-0.5"><ImageIcon className="h-2.5 w-2.5" />{insight.images_count}</span>
          </div>
        )}
      </div>
      <div className="flex-1">
        {status === "processing" ? (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin text-primary" /> Analyzuji reklamy a web…
            </div>
            <Progress value={undefined as unknown as number} className="h-1 [&>div]:animate-pulse [&>div]:bg-primary" />
          </div>
        ) : status === "failed" ? (
          <p className="text-xs text-destructive">{insight?.error_message || "neznámá chyba"}</p>
        ) : status === "empty" ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" /> Žádné reklamy tohoto typu
          </div>
        ) : insight?.summary ? (
          <MarkdownBullets text={insight.summary} />
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground/80">
            <Sparkles className="h-3 w-3" /> Čeká na vygenerování
          </div>
        )}
      </div>
      {insight?.generated_at && status === "ready" && (
        <div className="text-[10px] text-muted-foreground/70 pt-1 border-t border-border/30">
          Aktualizováno {fmtDateTime(insight.generated_at)}
        </div>
      )}
    </div>
  );
}

function CompetitorBar({
  slug, competitors, adsByCompetitor, analyzingCompetitorId, insights, onAnalyze, onChange,
}: {
  slug: string;
  competitors: Competitor[];
  adsByCompetitor: Record<string, number>;
  analyzingCompetitorId: string | null;
  insights: InsightRow[];
  onAnalyze: (c: Competitor) => void;
  onChange: () => void;
}) {
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const slots = [1, 2, 3].map((slot) => competitors.find((c) => c.slot === slot) || null);

  const remove = async (id: string) => {
    if (!confirm("Smazat konkurenta a všechna jeho data?")) return;
    const { error } = await supabase.functions.invoke("manage-creative", {
      body: { action: "delete_competitor", competitor_id: id },
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Smazáno");
    onChange();
  };

  return (
    <section className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2 mb-2 px-1">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="text-xs font-semibold">Konkurenti</h2>
        <span className="text-[11px] text-muted-foreground">· {competitors.length}/3</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {slots.map((c, idx) => {
          const slot = idx + 1;
          if (editingSlot === slot) {
            return (
              <div key={slot} className="basis-full sm:basis-[340px]">
                <CompetitorEditor
                  slug={slug}
                  slot={slot}
                  competitor={c}
                  onSaved={() => { setEditingSlot(null); onChange(); }}
                  onCancel={() => setEditingSlot(null)}
                />
              </div>
            );
          }
          if (!c) {
            return (
              <button
                key={slot}
                onClick={() => setEditingSlot(slot)}
                className="flex-1 min-w-[180px] rounded-lg border border-dashed border-border bg-background hover:border-primary/50 hover:bg-primary/5 transition-colors px-3 py-2 inline-flex items-center justify-center gap-2 text-xs text-muted-foreground"
              >
                <Plus className="h-3.5 w-3.5" /> Přidat konkurenta
              </button>
            );
          }
          const isAnalyzing = analyzingCompetitorId === c.id;
          const insight = insights.find((i) => i.competitor_id === c.id && i.insight_type === "competitor_summary");
          const hasSummary = insight?.status === "ready";
          return (
            <div key={c.id} className="flex-1 min-w-[240px] rounded-lg border border-border bg-background px-3 py-2 flex items-center gap-2">
              <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-primary/15 text-primary text-[10px] font-semibold shrink-0">{slot}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-semibold truncate">{c.name}</h3>
                  {c.website_url && (
                    <a href={c.website_url} target="_blank" rel="noreferrer" title={c.website_url} className="text-muted-foreground hover:text-primary shrink-0"><Globe className="h-3 w-3" /></a>
                  )}
                </div>
                {isAnalyzing ? (
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-primary">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    <span>Analyzuji web + reklamy…</span>
                  </div>
                ) : (
                  <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                    <span className="inline-flex items-center gap-0.5"><FileText className="h-2.5 w-2.5" />{adsByCompetitor[c.id] || 0}</span>
                    {hasSummary && <span className="inline-flex items-center gap-0.5 text-[#b0f221]"><CheckCircle2 className="h-2.5 w-2.5" />souhrn</span>}
                    {!c.meta_library_url && <span className="text-destructive/80">· Meta URL chybí</span>}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <Button
                  size="sm"
                  variant={hasSummary ? "outline" : "default"}
                  className="h-7 gap-1 text-[11px] px-2"
                  disabled={!c.meta_library_url || isAnalyzing}
                  onClick={() => onAnalyze(c)}
                  title="Spustit kompletní analýzu konkurenta"
                >
                  {isAnalyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                  {hasSummary ? "Přeanalyzovat" : "Analyzovat"}
                </Button>
                <button onClick={() => setEditingSlot(slot)} className="p-1.5 text-muted-foreground hover:text-foreground" title="Upravit"><Pencil className="h-3 w-3" /></button>
                <button onClick={() => remove(c.id)} className="p-1.5 text-muted-foreground hover:text-destructive" title="Smazat"><Trash2 className="h-3 w-3" /></button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CompetitorEditor({
  slug, slot, competitor, onSaved, onCancel,
}: {
  slug: string; slot: number; competitor: Competitor | null;
  onSaved: () => void; onCancel: () => void;
}) {
  const [name, setName] = useState(competitor?.name || "");
  const [metaUrl, setMetaUrl] = useState(competitor?.meta_library_url || "");
  const [webUrl, setWebUrl] = useState(competitor?.website_url || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) { toast.error("Zadej název konkurenta"); return; }
    setSaving(true);
    const { error } = await supabase.functions.invoke("manage-creative", {
      body: {
        action: "upsert_competitor",
        client_slug: slug,
        competitor: {
          id: competitor?.id, slot, name: name.trim(),
          meta_library_url: metaUrl.trim() || null,
          website_url: webUrl.trim() || null,
        },
      },
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Uloženo");
    onSaved();
  };

  return (
    <div className="rounded-xl border border-primary/40 bg-background p-3 space-y-2 min-h-[140px]">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center h-5 w-5 rounded-md bg-primary/15 text-primary text-[10px] font-semibold">{slot}</span>
        <span className="text-xs font-semibold">{competitor ? "Upravit" : "Nový konkurent"}</span>
      </div>
      <Input placeholder="Název (např. Symprove)" value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" />
      <Input placeholder="Meta Ad Library URL" value={metaUrl} onChange={(e) => setMetaUrl(e.target.value)} className="h-8 text-xs" />
      <Input placeholder="Web (https://…)" value={webUrl} onChange={(e) => setWebUrl(e.target.value)} className="h-8 text-xs" />
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={save} disabled={saving} className="h-7 gap-1 text-xs flex-1">
          <Check className="h-3 w-3" /> Uložit
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={saving} className="h-7 gap-1 text-xs">
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
