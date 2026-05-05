import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageSpinner } from "@/components/ui/spinner";
import { Sparkles, Globe, FileText, Upload, Trash2, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "sonner";

interface Profile {
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  font_family: string | null;
  tone_of_voice: string | null;
  scraped_data: any;
  client_brief?: string | null;
  client_brief_file_name?: string | null;
  client_brief_char_count?: number | null;
  client_brief_updated_at?: string | null;
}

const EMPTY: Profile = {
  primary_color: "",
  secondary_color: "",
  accent_color: "",
  font_family: "",
  tone_of_voice: "",
  scraped_data: null,
  client_brief: null,
  client_brief_file_name: null,
  client_brief_char_count: null,
  client_brief_updated_at: null,
};

const ACCEPT = ".pdf,.docx,.txt,.md";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function fmtDate(s: string | null | undefined) {
  if (!s) return "";
  try {
    return new Date(s).toLocaleDateString("cs-CZ", { day: "numeric", month: "short", year: "numeric" });
  } catch { return ""; }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = String(r.result || "");
      const idx = result.indexOf("base64,");
      resolve(idx >= 0 ? result.slice(idx + 7) : result);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function BrandDnaPage({ slug, clientName }: { slug: string; clientName: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [profile, setProfile] = useState<Profile>(EMPTY);
  const [briefUploading, setBriefUploading] = useState(false);
  const [briefExpanded, setBriefExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.functions.invoke("manage-creative", {
        body: { action: "get_brand_profile", client_slug: slug },
      });
      if (alive) {
        const p = data?.profile || EMPTY;
        setProfile(p);
        if (p.scraped_data?.source_url) setScrapeUrl(p.scraped_data.source_url);
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [slug]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.functions.invoke("manage-creative", {
      body: { action: "upsert_brand_profile", client_slug: slug, profile },
    });
    setSaving(false);
    if (error) toast.error("Nepodařilo se uložit: " + error.message);
    else toast.success("Brand DNA uloženo");
  };

  const scrape = async () => {
    if (!scrapeUrl) return;
    setScraping(true);
    const { data, error } = await supabase.functions.invoke("analyze-brand-dna", {
      body: { client_slug: slug, url: scrapeUrl },
    });
    setScraping(false);
    if (error) {
      toast.error("Analýza selhala: " + error.message);
      return;
    }
    if (data?.profile) {
      setProfile((p) => ({
        ...p,
        primary_color: data.profile.primary_color || p.primary_color,
        secondary_color: data.profile.secondary_color || p.secondary_color,
        accent_color: data.profile.accent_color || p.accent_color,
        font_family: data.profile.font_family || p.font_family,
        tone_of_voice: data.profile.tone_of_voice || p.tone_of_voice,
        scraped_data: {
          ...(data.profile.scraped_data || p.scraped_data || {}),
          source_url: scrapeUrl,
        },
      }));
      toast.success("Brand DNA vyplněno z webu — zkontroluj a ulož");
    }
  };

  const uploadBrief = async (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      toast.error("Soubor je větší než 10 MB");
      return;
    }
    setBriefUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke("extract-client-brief", {
        body: {
          client_slug: slug,
          file_name: file.name,
          mime_type: file.type,
          file_base64: base64,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setProfile((p) => ({
        ...p,
        client_brief: data.text,
        client_brief_file_name: data.file_name,
        client_brief_char_count: data.char_count,
        client_brief_updated_at: new Date().toISOString(),
      }));
      if (data.truncated) {
        toast.success(`Brief načten — zkrácen na 30 000 znaků (původně ${data.original_length.toLocaleString("cs-CZ")})`);
      } else {
        toast.success(`Brief načten · ${data.char_count.toLocaleString("cs-CZ")} znaků`);
      }
    } catch (e: any) {
      toast.error("Nahrání selhalo: " + (e?.message || String(e)));
    } finally {
      setBriefUploading(false);
    }
  };

  const deleteBrief = async () => {
    if (!confirm("Opravdu smazat klientský brief?")) return;
    const { error } = await supabase.functions.invoke("manage-creative", {
      body: { action: "clear_client_brief", client_slug: slug },
    });
    if (error) {
      toast.error("Smazání selhalo: " + error.message);
      return;
    }
    setProfile((p) => ({
      ...p,
      client_brief: null,
      client_brief_file_name: null,
      client_brief_char_count: null,
      client_brief_updated_at: null,
    }));
    setBriefExpanded(false);
    toast.success("Brief smazán");
  };

  if (loading) return <PageSpinner label="Načítám Brand DNA…" />;

  const hasBrief = !!profile.client_brief;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        maxWidth="max-w-4xl"
        breadcrumbs={[
          { label: "Creative Lab", href: "/creative", icon: Sparkles },
          { label: clientName, href: `/creative/${slug}` },
          { label: "Brand DNA" },
        ]}
      />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <section className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Analýza z webu</h2>
          </div>
          <p className="text-xs text-muted-foreground">Vlož URL hlavní stránky klienta. Stáhneme barvy, typografii a tone of voice.</p>
          <div className="flex gap-2">
            <Input
              placeholder="https://example.cz"
              value={scrapeUrl}
              onChange={(e) => setScrapeUrl(e.target.value)}
            />
            <Button onClick={scrape} disabled={scraping || !scrapeUrl}>
              {scraping ? "Analyzuji…" : "Analyzovat"}
            </Button>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Klientský brief</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Nahraj brief klienta (PDF, DOCX, TXT, max 10 MB). AI ho zohlední při generování kreativ. Limit 30 000 znaků.
          </p>

          {hasBrief && (
            <div className="rounded-lg border border-border/70 bg-muted/30 p-3 space-y-2">
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{profile.client_brief_file_name || "brief"}</div>
                  <div className="text-xs text-muted-foreground">
                    {(profile.client_brief_char_count || 0).toLocaleString("cs-CZ")} znaků
                    {profile.client_brief_updated_at ? ` · ${fmtDate(profile.client_brief_updated_at)}` : ""}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setBriefExpanded((v) => !v)} className="gap-1.5">
                  {briefExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {briefExpanded ? "Skrýt" : "Zobrazit text"}
                </Button>
                <Button variant="ghost" size="sm" onClick={deleteBrief} className="gap-1.5 text-destructive hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" /> Smazat
                </Button>
              </div>
              {briefExpanded && (
                <Textarea
                  readOnly
                  value={profile.client_brief || ""}
                  rows={14}
                  className="text-xs font-mono bg-background"
                />
              )}
            </div>
          )}

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadBrief(f);
                e.target.value = "";
              }}
            />
            <Button
              variant={hasBrief ? "outline" : "default"}
              onClick={() => fileInputRef.current?.click()}
              disabled={briefUploading}
              className="gap-1.5"
            >
              {briefUploading ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Zpracovávám…</>
              ) : (
                <><Upload className="h-3.5 w-3.5" /> {hasBrief ? "Nahrát jiný brief" : "Nahrát soubor"}</>
              )}
            </Button>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4 space-y-4">
          <h2 className="text-sm font-semibold">Manuální nastavení</h2>
          {profile.scraped_data?.ai_color_reasoning && (
            <div className="text-xs text-muted-foreground bg-muted/40 border border-border/60 rounded-lg p-2.5 leading-relaxed">
              <span className="font-medium text-foreground">Návrh barev z AI:</span>{" "}
              {profile.scraped_data.ai_color_reasoning}{" "}
              <span className="opacity-70">Pokud nesedí, uprav níže.</span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ColorField label="Primární barva" value={profile.primary_color || ""} onChange={(v) => setProfile({ ...profile, primary_color: v })} />
            <ColorField label="Sekundární barva" value={profile.secondary_color || ""} onChange={(v) => setProfile({ ...profile, secondary_color: v })} />
            <ColorField label="Akcentní barva" value={profile.accent_color || ""} onChange={(v) => setProfile({ ...profile, accent_color: v })} />
          </div>
          <div>
            <Label className="text-xs">Font</Label>
            <Input
              placeholder="např. Inter, Space Grotesk"
              value={profile.font_family || ""}
              onChange={(e) => setProfile({ ...profile, font_family: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Tone of voice</Label>
            <Textarea
              placeholder="Stručný popis komunikačního stylu klienta…"
              rows={4}
              value={profile.tone_of_voice || ""}
              onChange={(e) => setProfile({ ...profile, tone_of_voice: e.target.value })}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? "Ukládám…" : "Uložit"}
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const isHex = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2 items-center">
        <div
          className="h-9 w-9 rounded border border-border flex-shrink-0"
          style={{ background: isHex ? value : "transparent" }}
        />
        <Input
          placeholder="#0066ff"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}