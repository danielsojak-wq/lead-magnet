import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageSpinner } from "@/components/ui/spinner";
import { Sparkles, Download, RefreshCw, Check, X } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "sonner";
import { CreativeOverlay } from "./CreativeOverlay";

interface Brief {
  id: string;
  client_slug: string;
  name: string;
  usp: string | null;
  claim: string | null;
  goal: string | null;
  audience: string | null;
  website_url?: string | null;
  landing_url?: string | null;
  product_context?: string | null;
  created_at: string;
}
interface Variant {
  id: string;
  name: string;
  format: string;
  angle: string | null;
  copy_count: number;
  image_count: number;
}
interface Asset {
  id: string;
  variant_id: string;
  raw_image_url: string | null;
  copy_headline: string | null;
  copy_body: string | null;
  copy_cta: string | null;
  status: "draft" | "approved" | "rejected";
}

export function BriefDetailPage({ slug, briefId, clientName }: { slug: string; briefId: string; clientName: string }) {
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const { data, isLoading, refetch } = useQuery<{
    brief: Brief; variants: Variant[]; assets: Asset[]; brand?: any;
  }>({
    queryKey: ["creative-brief-detail", briefId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-creative", {
        body: { action: "get_brief_detail", brief_id: briefId },
      });
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });

  const brief = data?.brief;
  const variants = data?.variants || [];
  const assets = data?.assets || [];
  const brand = data?.brand || null;

  const setStatus = async (assetId: string, status: "approved" | "rejected" | "draft") => {
    const { error } = await supabase.functions.invoke("manage-creative", {
      body: { action: "set_asset_status", asset_id: assetId, status },
    });
    if (error) toast.error(error.message);
    else refetch();
  };

  const regenerate = async () => {
    setRegenerating(true);
    const { error } = await supabase.functions.invoke("generate-creative-batch", {
      body: { brief_id: briefId, only_missing: true },
    });
    setRegenerating(false);
    if (error) toast.error(error.message);
    else { toast.success("Generování spuštěno"); refetch(); }
  };

  const exportZip = async () => {
    const approved = assets.filter((a) => a.status === "approved");
    if (approved.length === 0) {
      toast.error("Vyber alespoň jednu schválenou kreativu");
      return;
    }
    setExporting(true);
    const { data, error } = await supabase.functions.invoke("export-creative-zip", {
      body: { brief_id: briefId, asset_ids: approved.map((a) => a.id) },
    });
    setExporting(false);
    if (error || !data?.url) { toast.error("Export selhal: " + (error?.message || "")); return; }
    window.open(data.url, "_blank");
  };

  if (isLoading || !brief) return <PageSpinner label="Načítám brief…" />;

  const totalExpected = variants.reduce((sum, v) => sum + Math.max(v.copy_count, v.image_count), 0);
  const generated = assets.length;
  const inProgress = generated < totalExpected;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        breadcrumbs={[
          { label: "Creative Lab", href: "/creative", icon: Sparkles },
          { label: clientName, href: `/creative/${slug}` },
          { label: brief.name },
        ]}
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={regenerate} disabled={regenerating}>
              <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} />
              Doplnit chybějící
            </Button>
            <Button size="sm" className="gap-1.5" onClick={exportZip} disabled={exporting}>
              <Download className="h-3.5 w-3.5" /> {exporting ? "Připravuji…" : "Stáhnout ZIP"}
            </Button>
          </>
        }
      />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <section className="rounded-xl border border-border bg-card p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {brief.usp && <Field label="USP" value={brief.usp} />}
          {brief.claim && <Field label="Claim" value={brief.claim} />}
          {brief.goal && <Field label="Cíl" value={brief.goal} />}
          {brief.audience && <Field label="Cílovka" value={brief.audience} />}
        </section>

        {inProgress && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-foreground/80">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
                Generuji kreativy…
              </span>
              <span className="font-medium tabular-nums">
                {generated} / {totalExpected} ({Math.round((generated / Math.max(totalExpected, 1)) * 100)}%)
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/10">
              <div
                className="h-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${Math.min(100, (generated / Math.max(totalExpected, 1)) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {variants.map((variant) => {
          const va = assets.filter((a) => a.variant_id === variant.id);
          return (
            <section key={variant.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">{variant.name}</h2>
                <Badge variant="outline" className="text-xs">{variant.format}</Badge>
                {variant.angle && <Badge variant="secondary" className="text-xs">{variant.angle}</Badge>}
              </div>
              {va.length === 0 ? (
                <p className="text-xs text-muted-foreground">Čekám na generování…</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {va.map((a) => (
                    <article key={a.id} className={`rounded-xl border bg-card overflow-hidden ${
                      a.status === "approved" ? "border-primary ring-1 ring-primary" :
                      a.status === "rejected" ? "border-destructive/50 opacity-60" :
                      "border-border"
                    }`}>
                      <CreativeOverlay
                        imageUrl={a.raw_image_url}
                        headline={a.copy_headline}
                        cta={a.copy_cta}
                        clientSlug={brief.client_slug}
                        clientName={clientName}
                        format={variant.format}
                        brand={brand}
                        seed={a.id}
                      />
                      <div className="p-3 space-y-1.5">
                        {a.copy_body && <p className="text-xs text-muted-foreground leading-relaxed">{a.copy_body}</p>}
                        {a.copy_cta && <p className="text-xs font-medium text-primary">→ {a.copy_cta}</p>}
                      </div>
                      <div className="px-3 pb-3 flex gap-1.5">
                        <Button
                          variant={a.status === "approved" ? "default" : "outline"}
                          size="sm" className="flex-1 gap-1"
                          onClick={() => setStatus(a.id, a.status === "approved" ? "draft" : "approved")}
                        >
                          <Check className="h-3.5 w-3.5" /> Schválit
                        </Button>
                        <Button
                          variant={a.status === "rejected" ? "destructive" : "outline"}
                          size="sm" className="flex-1 gap-1"
                          onClick={() => setStatus(a.id, a.status === "rejected" ? "draft" : "rejected")}
                        >
                          <X className="h-3.5 w-3.5" /> Zamítnout
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </main>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground uppercase tracking-wider text-[10px]">{label}</p>
      <p className="text-foreground">{value}</p>
    </div>
  );
}