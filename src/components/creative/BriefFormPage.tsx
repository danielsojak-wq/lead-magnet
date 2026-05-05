import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Sparkles, Wand2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "sonner";

const SESSION_KEY = "dashboard_auth";

const FORMATS = [
  { value: "1:1", label: "Čtverec 1:1" },
  { value: "9:16", label: "Story 9:16" },
  { value: "16:9", label: "Landscape 16:9" },
  { value: "4:5", label: "Portrét 4:5" },
];

const ANGLES = [
  { value: "emocionalni", label: "Emocionální" },
  { value: "racionalni", label: "Racionální" },
  { value: "urgence", label: "Urgence / sleva" },
  { value: "socialni-dukaz", label: "Sociální důkaz" },
  { value: "edukacni", label: "Edukační" },
  { value: "humor", label: "Humor" },
];

interface Variant {
  name: string;
  format: string;
  angle: string;
  copy_count: number;
  image_count: number;
  note: string;
}

function emptyVariant(idx: number): Variant {
  return {
    name: `Varianta ${idx + 1}`,
    format: "1:1",
    angle: "emocionalni",
    copy_count: 3,
    image_count: 2,
    note: "",
  };
}

export function BriefFormPage({ slug, clientName }: { slug: string; clientName: string }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [usp, setUsp] = useState("");
  const [claim, setClaim] = useState("");
  const [goal, setGoal] = useState("");
  const [audience, setAudience] = useState("");
  const [landingUrl, setLandingUrl] = useState("");
  const [productContext, setProductContext] = useState("");
  const [variants, setVariants] = useState<Variant[]>([emptyVariant(0)]);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [inspirationAds, setInspirationAds] = useState<any[]>([]);
  const [selectedInspirationIds, setSelectedInspirationIds] = useState<Set<string>>(new Set());
  const [productImages, setProductImages] = useState<string[]>([]);
  const [selectedProductImages, setSelectedProductImages] = useState<Set<string>>(new Set());
  const [landingExcerpt, setLandingExcerpt] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.functions.invoke("manage-creative", {
        body: { action: "list_inspiration_ads", client_slug: slug },
      });
      if (cancelled) return;
      if (error) return;
      const ads = data?.ads || [];
      setInspirationAds(ads);
      setSelectedInspirationIds(new Set(ads.filter((a: any) => a.is_inspiration).map((a: any) => a.id)));
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const toggleSelected = (id: string) => {
    setSelectedInspirationIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const addVariant = () => setVariants((v) => [...v, emptyVariant(v.length)]);
  const removeVariant = (i: number) => setVariants((v) => v.filter((_, idx) => idx !== i));
  const updateVariant = (i: number, patch: Partial<Variant>) =>
    setVariants((v) => v.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const generateSuggestions = async () => {
    setSuggesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-creative", {
        body: { action: "suggest_brief_fields", client_slug: slug, landing_url: landingUrl },
      });
      if (error) throw error;
      const s = data?.suggestion || {};
      if (s.usp) setUsp(s.usp);
      if (s.claim) setClaim(s.claim);
      if (s.goal) setGoal(s.goal);
      if (s.audience) setAudience(s.audience);
      if (s.product_context) setProductContext(s.product_context);
      const imgs: string[] = Array.isArray(data?.product_images) ? data.product_images : [];
      setProductImages(imgs);
      // Pre-select the first one (most relevant - usually OG image)
      setSelectedProductImages(new Set(imgs.slice(0, 1)));
      if (typeof data?.landing_excerpt === "string") setLandingExcerpt(data.landing_excerpt);
      toast.success("Návrhy vygenerovány");
    } catch (e: any) {
      toast.error("Nepodařilo se vygenerovat: " + (e?.message || "neznámá chyba"));
    } finally {
      setSuggesting(false);
    }
  };

  const toggleProductImage = (url: string) => {
    setSelectedProductImages((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url); else next.add(url);
      return next;
    });
  };

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Vyplň název briefu");
      return;
    }
    if (variants.length === 0) {
      toast.error("Přidej alespoň jednu variantu");
      return;
    }
    setSaving(true);
    let createdByEmail: string | undefined;
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "{}");
      createdByEmail = s.adminName || s.name;
    } catch {}

    const { data, error } = await supabase.functions.invoke("manage-creative", {
      body: {
        action: "create_brief",
        client_slug: slug,
        brief: {
          name, usp, claim, goal, audience,
          landing_url: landingUrl,
          product_context: productContext,
          created_by_email: createdByEmail,
          product_images: Array.from(selectedProductImages),
          landing_excerpt: landingExcerpt,
        },
        variants,
        inspiration_ad_ids: Array.from(selectedInspirationIds),
      },
    });
    if (error || !data?.brief_id) {
      setSaving(false);
      toast.error("Nepodařilo se uložit: " + (error?.message || "neznámá chyba"));
      return;
    }

    // Trigger generation async
    supabase.functions.invoke("generate-creative-batch", {
      body: { brief_id: data.brief_id },
    }).catch(() => {});

    toast.success("Brief uložen, spouštím generování");
    navigate(`/creative/${slug}/brief/${data.brief_id}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        maxWidth="max-w-5xl"
        breadcrumbs={[
          { label: "Creative Lab", href: "/creative", icon: Sparkles },
          { label: clientName, href: `/creative/${slug}` },
          { label: "Nový brief" },
        ]}
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <section className="rounded-xl border border-border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Brief</h2>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={generateSuggestions}
              disabled={suggesting}
            >
              <Wand2 className="h-3.5 w-3.5" />
              {suggesting ? "Generuji…" : "Vygenerovat z webu"}
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label className="text-xs">Název kampaně *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="např. Black Friday 2026" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Landing page kampaně</Label>
              <Input value={landingUrl} onChange={(e) => setLandingUrl(e.target.value)} placeholder="https://klient.cz/akce (nepovinné)" />
            </div>
            <div>
              <Label className="text-xs">USP</Label>
              <Input value={usp} onChange={(e) => setUsp(e.target.value)} placeholder="Hlavní výhoda" />
            </div>
            <div>
              <Label className="text-xs">Claim</Label>
              <Input value={claim} onChange={(e) => setClaim(e.target.value)} placeholder="Krátké heslo" />
            </div>
            <div>
              <Label className="text-xs">Cíl kampaně</Label>
              <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="např. zvýšit konverze o 20 %" />
            </div>
            <div>
              <Label className="text-xs">Cílovka</Label>
              <Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="např. ženy 25–45, ČR" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Produktový kontext (vizuální vodítka)</Label>
              <Textarea
                rows={3}
                value={productContext}
                onChange={(e) => setProductContext(e.target.value)}
                placeholder="Co má být na obrázku? Např. 'tepelné čerpadlo v moderním rodinném domě, útulný interiér, zima venku'"
              />
            </div>
          </div>
        </section>

        {productImages.length > 0 && (
          <section className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div>
              <h2 className="text-sm font-semibold">Produktové fotky z webu</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Vyber fotku produktu, která bude na všech kreativách zachována identicky. ({selectedProductImages.size} z {productImages.length})
              </p>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {productImages.map((url) => {
                const sel = selectedProductImages.has(url);
                return (
                  <button
                    key={url}
                    type="button"
                    onClick={() => toggleProductImage(url)}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                      sel ? "border-primary ring-2 ring-primary/30" : "border-border opacity-60 hover:opacity-100"
                    }`}
                    title={url}
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    {sel && (
                      <div className="absolute top-1 right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">✓</div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Varianty</h2>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={addVariant}>
              <Plus className="h-3.5 w-3.5" /> Přidat variantu
            </Button>
          </div>

          <div className="space-y-3">
            {variants.map((v, i) => (
              <div key={i} className="rounded-lg border border-border p-3 space-y-3 bg-background/50">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-4">
                    <Label className="text-xs">Název</Label>
                    <Input value={v.name} onChange={(e) => updateVariant(i, { name: e.target.value })} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Formát</Label>
                    <Select value={v.format} onValueChange={(val) => updateVariant(i, { format: val })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FORMATS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-3">
                    <Label className="text-xs">Úhel</Label>
                    <Select value={v.angle} onValueChange={(val) => updateVariant(i, { angle: val })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ANGLES.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-1">
                    <Label className="text-xs"># copy</Label>
                    <Input
                      type="number" min={1} max={10}
                      value={v.copy_count}
                      onChange={(e) => updateVariant(i, { copy_count: Number(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <Label className="text-xs"># image</Label>
                    <Input
                      type="number" min={0} max={10}
                      value={v.image_count}
                      onChange={(e) => updateVariant(i, { image_count: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="sm:col-span-1 flex items-end">
                    <Button
                      variant="ghost" size="icon"
                      className="h-9 w-9 text-muted-foreground hover:text-destructive"
                      onClick={() => removeVariant(i)}
                      disabled={variants.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Poznámka</Label>
                  <Input value={v.note} onChange={(e) => updateVariant(i, { note: e.target.value })} placeholder="Nepovinné" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {inspirationAds.length > 0 && (
          <section className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Inspirační reference</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Vybrané reklamy konkurence ovlivní text i vizuální styl generovaných kreativ. ({selectedInspirationIds.size} z {inspirationAds.length})
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelectedInspirationIds(new Set())}>Žádné</Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedInspirationIds(new Set(inspirationAds.map((a) => a.id)))}>Vše</Button>
              </div>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {inspirationAds.map((ad) => {
                const sel = selectedInspirationIds.has(ad.id);
                return (
                  <button
                    key={ad.id}
                    type="button"
                    onClick={() => toggleSelected(ad.id)}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                      sel ? "border-primary ring-2 ring-primary/30" : "border-border opacity-60 hover:opacity-100"
                    }`}
                    title={ad.primary_text || ad.page_name || ""}
                  >
                    {ad.image_url ? (
                      <img src={ad.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground bg-muted/40">bez náhledu</div>
                    )}
                    {ad.ad_type && (
                      <span className="absolute top-1 left-1 text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-background/80 backdrop-blur border border-border">
                        {ad.ad_type}
                      </span>
                    )}
                    {sel && (
                      <div className="absolute top-1 right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">✓</div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => navigate(`/creative/${slug}`)}>Zrušit</Button>
          <Button onClick={submit} disabled={saving} className="gap-1.5">
            <Sparkles className="h-4 w-4" />
            {saving ? "Generuji…" : "Uložit a vygenerovat"}
          </Button>
        </div>
      </main>
    </div>
  );
}