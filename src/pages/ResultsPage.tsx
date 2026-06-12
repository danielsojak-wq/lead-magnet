import { useState, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { trackEvent, getUtmData } from "@/lib/analytics";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import {
  ExternalLink, Globe, Layers, Video, Image as ImageIcon,
  ArrowRight, RefreshCw, Mail, CalendarCheck, X, Check,
  Zap, Target, MessageSquare, Activity, Lightbulb, AlertCircle,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import performindLogo from "@/assets/performind-logo-dark.svg";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdItem {
  id: string;
  image_url: string | null;
  video_url: string | null;
  primary_text: string | null;
  is_catalog?: boolean;
  ad_type: "brand" | "sales" | "retargeting" | null;
  ad_source: "meta" | "google";
  is_active: boolean;
  ad_start_date: string | null;
  format?: string | null;
}

interface AiAnalysis {
  reklamni_mix: {
    meta: { single_image: number; carousel: number; video: number; stories: number };
    google: { search: number; display: number; video: number; pmax: number };
  };
  aktivita: {
    pocet_aktivnich_reklam: number;
    prumerna_delka_behu_dni: number;
    frekvence_novych_reklam: "vysoka" | "stredni" | "nizka";
  };
  messaging: {
    strategie_uctu?: string;
    hlavni_claim: string;
    tema_komunikace?: string;
    dominantni_emocni_apel: string;
    funnel_faze: string;
    osloveni: string;
    pouziva_emoji: boolean;
    socialni_dukaz: string[];
  };
  kreativni_vzorce: {
    nejcastejsi_hook: string;
    prumerna_delka_textu: string;
    top_reklama: { popis: string; proc_funguje: string };
  };
  landing_pages: {
    typ: string;
    testuje_ab: boolean;
    pouziva_slevy: boolean;
  };
}

interface AiCrossAnalysis {
  category_truths: Array<{ vzorec: string; vysvetleni: string }>;
  co_funguje_vsem: Array<{ insight: string; detail: string }>;
  mezery_prilezitosti: Array<{ prilezitost: string; potencial: "vysoky" | "stredni"; zduvodneni: string }>;
  pozice_zadavatele: {
    silne_stranky: string[];
    slabe_stranky: string[];
    radar: {
      objem_reklam: number;
      kreativni_diverzita: number;
      messaging_jasnost: number;
      brand_konzistence: number;
      funnel_pokryti: number;
    };
  };
  quick_wins: Array<{ akce: string; proc: string; obtiznost: "jednoduche" | "stredni" | "komplexni" }>;
}

interface CompetitorResult {
  id: string;
  name: string;
  website_url: string | null;
  summary: string | null;
  ai_analysis: AiAnalysis | null;
  status: "ready" | "processing" | "failed" | "empty" | "scrape_failed";
  ads_count: number;
  ad_mix: { brand: number; sales: number; retargeting: number };
  ads: AdItem[];
}

interface AnalysisResults {
  status?: string;
  eshop_name: string;
  eshop_competitor?: CompetitorResult | null;
  competitors: CompetitorResult[];
  cross_summary: string | null;
  ai_cross_analysis: AiCrossAnalysis | null;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK: AnalysisResults = {
  eshop_name: "Váš e-shop",
  cross_summary: null,
  ai_cross_analysis: {
    category_truths: [
      { vzorec: "Sociální důkaz jako základ", vysvetleni: "Všichni konkurenti staví první reklamy na recenzích a hodnocení zákazníků — v tomto segmentu je to nutnost, ne diferenciace." },
      { vzorec: "Before/after dominuje brand reklamám", vysvetleni: "Vizuální transformace je hlavní hook u brand formátů. 2 ze 3 konkurentů ho používají v 60 %+ brand kampaní." },
    ],
    co_funguje_vsem: [
      { insight: "Nejdéle běžící reklamy jsou testimonial nebo before/after", detail: "Průměrná délka těchto formátů je 3× vyšší než ostatní typy — investice do produkce se vrací." },
      { insight: "Emoji v prvních 5 znacích textu", detail: "Všichni to dělají. Zvyšuje pravděpodobnost zastavení scrollování na mobilních zařízeních." },
    ],
    mezery_prilezitosti: [
      { prilezitost: "Nikdo nevysvětluje 'proč zrovna teď'", potencial: "vysoky", zduvodneni: "Urgency je přítomná, ale vychází ze slevy, ne z kontextu zákazníka. Příběhová urgency je neobsazená." },
      { prilezitost: "Video delší než 60s chybí", potencial: "stredni", zduvodneni: "Nikdo netestuje vzdělávací formát. Segment má potenciál pro high-consideration zákazníky." },
    ],
    pozice_zadavatele: {
      silne_stranky: ["Aktivní přítomnost na Meta", "Diverzita kreativních formátů"],
      slabe_stranky: ["Nižší objem reklam oproti konkurenci", "Chybí retargeting vrstva"],
      radar: {
        objem_reklam: 4,
        kreativni_diverzita: 7,
        messaging_jasnost: 6,
        brand_konzistence: 5,
        funnel_pokryti: 3,
      },
    },
    quick_wins: [
      { akce: "Přidejte testimonial video s konkrétním číslem v titulku", proc: "Tento formát běží v průměru 3× déle — nejlepší ROI na produkci", obtiznost: "jednoduche" },
      { akce: "Spusťte retargeting kampaň pro návštěvníky produktových stránek", proc: "Konkurenti tuto vrstvu zanedbávají — máte volné pole", obtiznost: "stredni" },
      { akce: "Testujte příběhovou urgency (sezóna, životní situace) místo slev", proc: "Slevová urgency se vyčerpává. Kontextová urgency zatím nikdo nepoužívá.", obtiznost: "stredni" },
    ],
  },
  competitors: [
    {
      id: "c1", name: "Konkurent A", website_url: "https://konkurent-a.cz",
      status: "ready", ads_count: 42, summary: null,
      ad_mix: { brand: 38, sales: 48, retargeting: 14 },
      ai_analysis: {
        reklamni_mix: { meta: { single_image: 40, carousel: 20, video: 35, stories: 5 }, google: { search: 50, display: 30, video: 10, pmax: 10 } },
        aktivita: { pocet_aktivnich_reklam: 28, prumerna_delka_behu_dni: 45, frekvence_novych_reklam: "vysoka" },
        messaging: { hlavni_claim: "Výsledky do 14 dní nebo vrátíme peníze", dominantni_emocni_apel: "logika", funnel_faze: "conversion", osloveni: "tykani", pouziva_emoji: true, socialni_dukaz: ["cisla", "recenze"] },
        kreativni_vzorce: { nejcastejsi_hook: "cislo", prumerna_delka_textu: "kratky", top_reklama: { popis: "Testimonial video s číselným výsledkem v titulku", proc_funguje: "Číslo v prvních 3 sekundách = zástava scrollu. Běží 67 dní." } },
        landing_pages: { typ: "dedicated_lp", testuje_ab: true, pouziva_slevy: false },
      },
      ads: [
        { id: "a1", image_url: "https://picsum.photos/seed/ad1/400/400", video_url: null, primary_text: "93 % zákazníků vidí výsledky do 14 dní.", ad_type: "sales", ad_source: "meta", is_active: true, ad_start_date: "2026-03-01" },
        { id: "a2", image_url: "https://picsum.photos/seed/ad2/400/400", video_url: null, primary_text: "Před a po. Výsledky mluví samy za sebe.", ad_type: "brand", ad_source: "meta", is_active: true, ad_start_date: "2026-02-15" },
        { id: "a3", image_url: "https://picsum.photos/seed/ad3/400/400", video_url: null, primary_text: "Zapomněli jste? Váš košík na vás čeká.", ad_type: "retargeting", ad_source: "google", is_active: false, ad_start_date: "2026-01-20" },
        { id: "a4", image_url: "https://picsum.photos/seed/ad4/400/400", video_url: null, primary_text: "Limitovaná nabídka — jen do konce týdne.", ad_type: "sales", ad_source: "meta", is_active: true, ad_start_date: "2026-04-10" },
        { id: "a5", image_url: "https://picsum.photos/seed/ad5/400/400", video_url: null, primary_text: "Přidejte se k 12 000 spokojeným zákazníkům.", ad_type: "brand", ad_source: "google", is_active: true, ad_start_date: "2026-03-22" },
        { id: "a6", image_url: "https://picsum.photos/seed/ad6/400/400", video_url: null, primary_text: "Jednoduché. Rychlé. Efektivní.", ad_type: "brand", ad_source: "meta", is_active: true, ad_start_date: "2026-04-01" },
      ],
    },
    {
      id: "c2", name: "Konkurent B", website_url: "https://konkurent-b.cz",
      status: "ready", ads_count: 31, summary: null,
      ad_mix: { brand: 55, sales: 32, retargeting: 13 },
      ai_analysis: {
        reklamni_mix: { meta: { single_image: 20, carousel: 45, video: 30, stories: 5 }, google: { search: 40, display: 40, video: 15, pmax: 5 } },
        aktivita: { pocet_aktivnich_reklam: 19, prumerna_delka_behu_dni: 62, frekvence_novych_reklam: "nizka" },
        messaging: { hlavni_claim: "Konečně produkt, který opravdu funguje", dominantni_emocni_apel: "touha", funnel_faze: "awareness", osloveni: "tykani", pouziva_emoji: false, socialni_dukaz: ["ugc", "recenze"] },
        kreativni_vzorce: { nejcastejsi_hook: "otazka", prumerna_delka_textu: "dlouhy", top_reklama: { popis: "UGC video 'Den se zákaznicí'", proc_funguje: "Autentičnost překonává produkci v brand kampani. Běží 89 dní." } },
        landing_pages: { typ: "homepage", testuje_ab: false, pouziva_slevy: true },
      },
      ads: [
        { id: "b1", image_url: "https://picsum.photos/seed/b1/400/400", video_url: null, primary_text: "Znáte ten pocit, když konečně najdete to pravé?", ad_type: "brand", ad_source: "meta", is_active: true, ad_start_date: "2026-02-01" },
        { id: "b2", image_url: "https://picsum.photos/seed/b2/400/400", video_url: null, primary_text: "Změnilo to můj každodenní rutinu.", ad_type: "brand", ad_source: "meta", is_active: true, ad_start_date: "2026-03-10" },
        { id: "b3", image_url: "https://picsum.photos/seed/b3/400/400", video_url: null, primary_text: "Speciální nabídka pro nové zákazníky — 20 % sleva.", ad_type: "sales", ad_source: "google", is_active: true, ad_start_date: "2026-04-05" },
        { id: "b4", image_url: "https://picsum.photos/seed/b4/400/400", video_url: null, primary_text: "Stále přemýšlíte? Tady jsou odpovědi.", ad_type: "retargeting", ad_source: "meta", is_active: false, ad_start_date: "2026-01-15" },
        { id: "b5", image_url: "https://picsum.photos/seed/b5/400/400", video_url: null, primary_text: "Přes 8 000 zákazníků nemůže mýlit.", ad_type: "brand", ad_source: "meta", is_active: true, ad_start_date: "2026-03-28" },
        { id: "b6", image_url: "https://picsum.photos/seed/b6/400/400", video_url: null, primary_text: "Výprodej — poslední kusy skladem.", ad_type: "sales", ad_source: "google", is_active: true, ad_start_date: "2026-04-12" },
      ],
    },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_COLORS = { brand: "#4f11ff", sales: "#b0f221", retargeting: "#f59e0b" } as const;
const TYPE_LABELS = { brand: "Brand", sales: "Akvizice", retargeting: "Retargeting" };
function typeColor(t: string | null) {
  if (t === "brand") return TYPE_COLORS.brand;
  if (t === "sales") return TYPE_COLORS.sales;
  if (t === "retargeting") return TYPE_COLORS.retargeting;
  return "#d1d5db";
}

function parseMarkdown(text: string): { title: string; body: string }[] {
  const sections: { title: string; body: string }[] = [];
  const parts = text.split(/^###\s+/m).filter(p => p.trim());
  if (parts.length > 0 && /^###\s+/m.test(text)) {
    for (const p of parts) {
      const nl = p.indexOf("\n");
      sections.push({ title: (nl === -1 ? p : p.slice(0, nl)).trim(), body: nl === -1 ? "" : p.slice(nl + 1).trim() });
    }
  } else {
    sections.push({ title: "", body: text });
  }
  return sections;
}

function MarkdownBullets({ text }: { text: string }) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  return (
    <ul className="space-y-2">
      {lines.map((line, i) => {
        const clean = line.replace(/^[-*•]\s*/, "");
        const parts = clean.split(/(\*\*[^*]+\*\*)/g);
        return (
          <li key={i} className="flex gap-2.5 text-sm text-gray-700 leading-relaxed">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#4f11ff] shrink-0" />
            <span>
              {parts.map((p, j) =>
                p.startsWith("**") && p.endsWith("**")
                  ? <strong key={j} className="text-gray-900 font-semibold">{p.slice(2, -2)}</strong>
                  : <span key={j}>{p}</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function AdSourceBadge({ source }: { source: "meta" | "google" }) {
  return source === "google"
    ? <span className="absolute top-2 left-2 text-[10px] font-bold bg-blue-500 text-white px-1.5 py-0.5 rounded">Google</span>
    : <span className="absolute top-2 left-2 text-[10px] font-bold bg-[#1877F2] text-white px-1.5 py-0.5 rounded">Meta</span>;
}

// Poslední obrana: {{product.brand}} placeholdery z katalogových reklam se nesmí
// nikdy vyrenderovat (get-lm-results už sanituje, tohle kryje stale cache/starší API).
// Katalogovka bez jakéhokoli reálného textu → neutrální popisek místo prázdna.
const CATALOG_FALLBACK_TEXT = "Dynamická katalogová reklama";
function adDisplayText(ad: AdItem): string | null {
  const cleaned = (ad.primary_text ?? "")
    .replace(/\{\{[^{}]*\}\}/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
  if (/[\p{L}\p{N}]/u.test(cleaned)) return cleaned;
  return ad.is_catalog ? CATALOG_FALLBACK_TEXT : null;
}

function AdTypePill({ type }: { type: string | null }) {
  if (!type) return null;
  const label = TYPE_LABELS[type as keyof typeof TYPE_LABELS] || type;
  const bg = type === "brand" ? "bg-[#4f11ff]/10 text-[#4f11ff]" : type === "sales" ? "bg-[#b0f221]/30 text-gray-800" : "bg-amber-100 text-amber-700";
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${bg}`}>{label}</span>;
}

function playerColor(isEshop: boolean, index: number): string {
  if (isEshop) return "#6B46C1";
  return index === 0 ? "#3B82F6" : "#F97316";
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

const apeLabel = (a: string) => (({ strach: "Strach", touha: "Touha", logika: "Logika", humor: "Humor", komunita: "Komunita" } as Record<string, string>)[a] ?? a);
const funnelLabel = (f: string) => (({ awareness: "Awareness", consideration: "Consideration", conversion: "Conversion", mix: "Celý funnel" } as Record<string, string>)[f] ?? f);
const textLengthLabel = (t: string) => (({ kratky: "Krátký", stredni: "Střední", dlouhy: "Dlouhý" } as Record<string, string>)[t] ?? t);
const freqLabel = (f: string) => (({ vysoka: "Vysoká", stredni: "Střední", nizka: "Nízká" } as Record<string, string>)[f] ?? f);
const lpLabel = (t: string) => (({ dedicated_lp: "LP", homepage: "Homepage", category: "Kategorie", product: "Produkt", mix: "Mix" } as Record<string, string>)[t] ?? t);

// ─── Charts ───────────────────────────────────────────────────────────────────

function ComparisonChart({ competitors }: { competitors: CompetitorResult[] }) {
  const data = competitors.map(c => {
    const total = c.ad_mix.brand + c.ad_mix.sales + c.ad_mix.retargeting;
    return {
      name: c.name,
      Brand: total ? Math.round((c.ad_mix.brand / total) * 100) : 0,
      Akvizice: total ? Math.round((c.ad_mix.sales / total) * 100) : 0,
      Retargeting: total ? Math.round((c.ad_mix.retargeting / total) * 100) : 0,
    };
  });
  return (
    <>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical" barCategoryGap="30%">
          <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#374151", fontWeight: 500 }} axisLine={false} tickLine={false} width={150} interval={0} />
          <Tooltip formatter={(v: number, name: string) => [`${v}%`, name]} contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 12 }} />
          <Bar dataKey="Brand" stackId="a" fill={TYPE_COLORS.brand} />
          <Bar dataKey="Akvizice" stackId="a" fill={TYPE_COLORS.sales} />
          <Bar dataKey="Retargeting" stackId="a" fill={TYPE_COLORS.retargeting} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
      {/* Legenda — tečka má STEJNOU barvu jako segment v liště (stejný TYPE_COLORS) */}
      <div className="flex items-center justify-center gap-4 sm:gap-6 mt-2 flex-wrap">
        {([["brand", "Brand"], ["sales", "Akvizice"], ["retargeting", "Retargeting"]] as const).map(([k, lbl]) => (
          <span key={k} className="inline-flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: TYPE_COLORS[k] }} />
            {lbl}
          </span>
        ))}
      </div>
    </>
  );
}

const RADAR_AXES = ["Objem", "Kreativa", "Funnel", "Akvizice", "Brand", "Remarketing"] as const;
const RADAR_KEYS = ["objem", "kreativa", "funnel", "akvizice", "brand", "remarketing"] as const;
type RadarKey = typeof RADAR_KEYS[number];
const PLAYER_COLORS = ["#6B46C1", "#3B82F6", "#F97316"] as const;

function calcPlayerRadarValues(p: CompetitorResult, rawVolume: number, maxVolume: number): Record<RadarKey, number> {
  const ai = p.ai_analysis;
  const mix = p.ad_mix;
  const total = mix.brand + mix.sales + mix.retargeting;

  const objem = Math.round((rawVolume / maxVolume) * 100);

  const fmeta = ai?.reklamni_mix.meta;
  const formatCount = fmeta ? [fmeta.single_image, fmeta.carousel, fmeta.video].filter(v => v > 0).length : 0;
  const kreativa = Math.round(formatCount * 100 / 3);

  const funnelCount = [mix.brand > 0, mix.sales > 0, mix.retargeting > 0].filter(Boolean).length;
  const funnel = Math.round(funnelCount * 100 / 3);

  const akvizice = total ? Math.round((mix.sales / total) * 100) : 0;
  const brand = total ? Math.round((mix.brand / total) * 100) : 0;
  const remarketing = total ? Math.round((mix.retargeting / total) * 100) : 0;

  return { objem, kreativa, funnel, akvizice, brand, remarketing };
}

function PositioningRadar({ eshopName, eshopCompetitor, competitors }: {
  eshopName: string;
  eshopCompetitor: CompetitorResult | null | undefined;
  competitors: CompetitorResult[];
}) {
  const players = [
    eshopCompetitor ? { comp: eshopCompetitor, name: eshopName } : null,
    ...competitors.map(c => ({ comp: c, name: c.name })),
  ].filter(Boolean) as Array<{ comp: CompetitorResult; name: string }>;

  const volumes = players.map(p => p.comp.ai_analysis?.aktivita.pocet_aktivnich_reklam ?? p.comp.ads.filter(a => a.is_active).length);
  const maxVol = Math.max(...volumes, 1);
  const playerValues = players.map((p, i) => calcPlayerRadarValues(p.comp, volumes[i], maxVol));

  const data = RADAR_AXES.map((subject, ai) => {
    const entry: Record<string, unknown> = { subject };
    playerValues.forEach((pv, pi) => { entry[`p${pi}`] = pv[RADAR_KEYS[ai]]; });
    return entry;
  });

  return (
    <div>
      <div className="flex flex-wrap gap-4 mb-2 justify-center">
        {players.map((p, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PLAYER_COLORS[i] }} />
            {p.name}
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <RadarChart cx="50%" cy="50%" outerRadius="68%" data={data}>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "#6b7280" }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          {players.map((p, i) => (
            <Radar key={i} name={p.name} dataKey={`p${i}`} stroke={PLAYER_COLORS[i]} fill={PLAYER_COLORS[i]} fillOpacity={0.25} strokeWidth={2} />
          ))}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// JEDINÝ zdroj pravdy pro objem reklam v horní sekci: hráč = doména + reálný ads_count
// (barvy = sdílené PLAYER_COLORS výše: zadavatel fialová, k1 modrá, k2 oranžová)
// + barva. Zadavatel první (fialová), konkurenti dle pozice (modrá, oranžová).
// Hráče s 0 reklamami vynech (žádný prázdný segment).
function adVolumePlayers(
  eshopCompetitor: CompetitorResult | null | undefined,
  competitors: CompetitorResult[],
): { name: string; count: number; color: string }[] {
  const players: { name: string; count: number; color: string }[] = [];
  if (eshopCompetitor && eshopCompetitor.ads_count > 0) {
    players.push({
      name: extractDomain(eshopCompetitor.website_url ?? "") || eshopCompetitor.name,
      count: eshopCompetitor.ads_count,
      color: PLAYER_COLORS[0],
    });
  }
  competitors.forEach((c, i) => {
    if (c.ads_count > 0) {
      players.push({
        name: extractDomain(c.website_url ?? "") || c.name,
        count: c.ads_count,
        color: PLAYER_COLORS[i + 1] ?? PLAYER_COLORS[PLAYER_COLORS.length - 1],
      });
    }
  });
  return players;
}

function adVolumeTotal(
  eshopCompetitor: CompetitorResult | null | undefined,
  competitors: CompetitorResult[],
): number {
  return adVolumePlayers(eshopCompetitor, competitors).reduce((s, p) => s + p.count, 0);
}

// Horní sekce: neutrální přehled objemu reklam — velké číslo (součet napříč VŠEMI hráči)
// jako kotva ve středu donutu + rozpad po hráčích. Žádná interpretace (méně/více/lepší).
function AdVolumeDonut({ eshopCompetitor, competitors }: {
  eshopCompetitor: CompetitorResult | null | undefined;
  competitors: CompetitorResult[];
}) {
  const players = adVolumePlayers(eshopCompetitor, competitors);
  const total = players.reduce((s, p) => s + p.count, 0);
  if (!players.length || total === 0) return null;

  return (
    <div className="rounded-3xl bg-white border border-gray-100 shadow-sm p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-10">
        {/* Donut s velkým číslem ve středu (kotva) + label POD donutem (ať nepřetéká dírou) */}
        <div className="shrink-0 flex flex-col items-center gap-2">
          <div className="relative w-[180px] h-[180px] sm:w-[200px] sm:h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={players}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="70%"
                  outerRadius="96%"
                  paddingAngle={players.length > 1 ? 2 : 0}
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {players.map((p, i) => <Cell key={i} fill={p.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="font-[family-name:var(--font-heading)] text-4xl sm:text-5xl font-bold text-gray-900 leading-none tabular-nums">{total}</div>
            </div>
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 text-center">Reklam analyzováno</div>
        </div>
        {/* Legenda: doména · počet */}
        <ul className="flex-1 w-full space-y-3 min-w-0">
          {players.map((p, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} aria-hidden />
              <span className="text-sm font-medium text-gray-900 truncate min-w-0">{p.name}</span>
              <span className="ml-auto text-sm font-semibold text-gray-500 tabular-nums shrink-0">{p.count}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function CrossAnalysisHero({ cross, eshopName, competitors }: { cross: AiCrossAnalysis | null; eshopName: string; competitors: CompetitorResult[] }) {
  const names = competitors.map(c => c.name).join(", ");

  return (
    <section className="bg-gradient-to-br from-[#4f11ff] to-[#7c3aed] rounded-3xl p-8 sm:p-10 text-white">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
          <Layers className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-1">Průnik napříč konkurencí</div>
          <h2 className="font-[family-name:var(--font-heading)] text-xl sm:text-2xl font-bold">Co dělá {names} stejně</h2>
          <p className="text-white/70 text-sm mt-1">Vzorce fungující v segmentu — a mezery, kde může {eshopName} vyniknout.</p>
        </div>
      </div>

      {!cross && <p className="text-white/50 text-sm">Syntéza se generuje…</p>}

      {cross && (
        <div className="grid sm:grid-cols-2 gap-4">
          {/* Category truths */}
          {cross.category_truths?.length > 0 && (
            <div className="rounded-2xl bg-white/10 border border-white/10 p-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#b0f221] mb-3">Co platí pro segment</h3>
              <ul className="space-y-3">
                {cross.category_truths.map((t, i) => (
                  <li key={i}>
                    <p className="text-sm font-semibold text-white">{t.vzorec}</p>
                    <p className="text-xs text-white/60 mt-0.5 leading-relaxed">{t.vysvetleni}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Co funguje vsem */}
          {cross.co_funguje_vsem?.length > 0 && (
            <div className="rounded-2xl bg-white/10 border border-white/10 p-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#b0f221] mb-3">Co funguje všem</h3>
              <ul className="space-y-3">
                {cross.co_funguje_vsem.map((t, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#b0f221] shrink-0" />
                    <div>
                      <p className="text-sm text-white font-medium">{t.insight}</p>
                      <p className="text-xs text-white/55 mt-0.5">{t.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Mezery */}
          {cross.mezery_prilezitosti?.length > 0 && (
            <div className="rounded-2xl bg-white/10 border border-white/10 p-5 sm:col-span-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#b0f221] mb-3">Mezery a příležitosti</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {cross.mezery_prilezitosti.map((m, i) => (
                  <div key={i} className="flex gap-3">
                    <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full self-start mt-0.5 ${m.potencial === "vysoky" ? "bg-[#b0f221]/30 text-[#b0f221]" : "bg-white/15 text-white/70"}`}>
                      {m.potencial === "vysoky" ? "Vysoký" : "Střední"} potenciál
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">{m.prilezitost}</p>
                      <p className="text-xs text-white/55 mt-0.5 leading-relaxed">{m.zduvodneni}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PositioningSection({ cross, eshopName, eshopCompetitor, competitors }: {
  cross: AiCrossAnalysis;
  eshopName: string;
  eshopCompetitor: CompetitorResult | null | undefined;
  competitors: CompetitorResult[];
}) {
  const { pozice_zadavatele: pos, quick_wins: wins } = cross;

  const difficultyColor = (d: string) =>
    d === "jednoduche" ? "bg-[#b0f221]/20 text-gray-800 border-[#b0f221]/40"
      : d === "stredni" ? "bg-amber-50 text-amber-800 border-amber-200"
        : "bg-[#4f11ff]/8 text-[#4f11ff] border-[#4f11ff]/20";

  const difficultyLabel = (d: string) =>
    d === "jednoduche" ? "Jednoduché" : d === "stredni" ? "Střední" : "Komplexní";

  return (
    <section className="bg-white rounded-3xl border border-gray-100 p-6 sm:p-8 shadow-sm space-y-8">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#4f11ff]/8 border border-[#4f11ff]/15 flex items-center justify-center shrink-0">
          <Target className="h-4 w-4 text-[#4f11ff]" />
        </div>
        <div>
          <h2 className="font-[family-name:var(--font-heading)] font-bold text-gray-900">Vaše pozice vs. konkurence</h2>
          <p className="text-xs text-gray-400 mt-0.5">Radar hodnotí {eshopName} na škále 1–10 v klíčových oblastech</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-8">
        {/* Radar */}
        <div>
          <PositioningRadar eshopName={eshopName} eshopCompetitor={eshopCompetitor} competitors={competitors} />
          <div className="grid grid-cols-2 gap-2 mt-4">
            <div className="bg-[#4f11ff]/5 rounded-xl p-3">
              <p className="text-xs font-semibold text-[#4f11ff] uppercase tracking-wide mb-2">Silné stránky</p>
              <ul className="space-y-1">
                {pos.silne_stranky.map((s, i) => (
                  <li key={i} className="flex gap-1.5 text-xs text-gray-700">
                    <Check className="h-3 w-3 text-[#4f11ff] shrink-0 mt-0.5" />{s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-red-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2">Slabé stránky</p>
              <ul className="space-y-1">
                {pos.slabe_stranky.map((s, i) => (
                  <li key={i} className="flex gap-1.5 text-xs text-gray-700">
                    <AlertCircle className="h-3 w-3 text-red-400 shrink-0 mt-0.5" />{s}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Quick wins */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-4 w-4 text-[#4f11ff]" />
            <h3 className="font-[family-name:var(--font-heading)] font-bold text-gray-900">Quick wins</h3>
          </div>
          <div className="space-y-3">
            {wins.map((w, i) => (
              <div key={i} className="border border-gray-100 rounded-xl p-4 hover:border-[#4f11ff]/25 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <p className="text-sm font-semibold text-gray-900 leading-snug">{w.akce}</p>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${difficultyColor(w.obtiznost)}`}>
                    {difficultyLabel(w.obtiznost)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{w.proc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}


function AdModal({ ad, onClose }: { ad: AdItem; onClose: () => void }) {
  return (
    <Dialog.Root open onOpenChange={o => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/75 z-50 animate-in fade-in-0" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl z-50 w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 max-h-[92vh] flex flex-col">
          <div className="relative bg-black flex items-center justify-center" style={{ maxHeight: "60vh" }}>
            {ad.video_url
              ? <video src={ad.video_url} poster={ad.image_url || undefined} controls autoPlay className="w-full max-h-[60vh] object-contain" />
              : ad.image_url
                ? <img src={ad.image_url} alt="" className="w-full max-h-[60vh] object-contain" />
                : <div className="w-full h-48 flex items-center justify-center bg-gray-800"><ImageIcon className="h-12 w-12 text-gray-500" /></div>}
            <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-colors">
              <X className="h-4 w-4 text-white" />
            </button>
            <div className="absolute top-3 left-3"><AdSourceBadge source={ad.ad_source} /></div>
            {ad.is_active && <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-black/50 rounded-full px-2 py-0.5"><span className="w-1.5 h-1.5 rounded-full bg-[#b0f221]" /><span className="text-[10px] text-white font-medium">Aktivní</span></div>}
          </div>
          <div className="p-5 overflow-y-auto flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <AdTypePill type={ad.ad_type} />
              {ad.ad_start_date && <span className="text-xs text-gray-400">spuštěna {ad.ad_start_date}</span>}
            </div>
            {adDisplayText(ad)
              ? <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{adDisplayText(ad)}</p>
              : <p className="text-sm text-gray-400 italic">Žádný text</p>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CompetitorSection({ competitor, index, isEshop }: { competitor: CompetitorResult; index: number; isEshop?: boolean }) {
  const [selectedAd, setSelectedAd] = useState<AdItem | null>(null);
  const color = playerColor(!!isEshop, index);
  const label = isEshop ? "Vy" : String(index + 1);
  const ai = competitor.ai_analysis;
  const sections = competitor.summary ? parseMarkdown(competitor.summary) : [];

  const activeCount = ai?.aktivita.pocet_aktivnich_reklam
    ?? competitor.ads.filter(a => a.is_active).length;

  const topAd = [...competitor.ads]
    .filter(a => a.ad_start_date)
    .sort((a, b) => (a.ad_start_date! < b.ad_start_date! ? -1 : 1))[0]
    ?? competitor.ads[0]
    ?? null;

  const daysInRotation = topAd?.ad_start_date
    ? Math.floor((Date.now() - new Date(topAd.ad_start_date).getTime()) / 86400000)
    : null;

  const fmeta = ai?.reklamni_mix.meta;
  const formatStr = fmeta
    ? ([
        fmeta.single_image > 0 ? `${fmeta.single_image} obr.` : null,
        fmeta.video > 0 ? `${fmeta.video} video` : null,
        fmeta.carousel > 0 ? `${fmeta.carousel} karusel` : null,
      ] as (string | null)[]).filter(Boolean).join(" · ")
    : null;

  const showTopReklama = ai
    && ai.kreativni_vzorce.top_reklama.popis
    && ai.kreativni_vzorce.top_reklama.popis !== "Bez dat";

  return (
    <section className="rounded-3xl border border-gray-100 bg-white overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-6 sm:px-8 py-5 flex items-center justify-between gap-4" style={{ borderBottom: `2px solid ${color}30` }}>
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0 font-[family-name:var(--font-heading)]"
            style={{ background: color }}
          >
            {label}
          </div>
          <div>
            <h2 className="font-[family-name:var(--font-heading)] font-bold text-gray-900 text-xl leading-tight">{competitor.name}</h2>
            {competitor.website_url && (
              <div className="flex items-center gap-3 mt-0.5">
                <a href={competitor.website_url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-[#4f11ff] transition-colors">
                  <Globe className="h-3 w-3" />{competitor.website_url.replace(/^https?:\/\//, "")}<ExternalLink className="h-2.5 w-2.5" />
                </a>
                <a
                  href={`https://adstransparency.google.com/?region=CZ&domain=${extractDomain(competitor.website_url)}`}
                  target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-[#4285f4] transition-colors"
                  title="Google Ads Transparency"
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  Google Ads<ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-[family-name:var(--font-heading)] text-3xl font-bold leading-none" style={{ color }}>{activeCount}</div>
          <div className="text-xs text-gray-400 mt-0.5">aktivních reklam</div>
        </div>
      </div>

      <div className="p-6 sm:p-8 space-y-6">
        {competitor.status === "processing" && (
          <div className="flex items-center gap-3 text-sm text-gray-500 bg-gray-50 rounded-xl p-4">
            <RefreshCw className="h-4 w-4 animate-spin text-[#4f11ff]" /> Generuji analýzu…
          </div>
        )}
        {competitor.status === "failed" && (
          <div className="text-sm text-red-500 bg-red-50 rounded-xl p-4">Analýza selhala.</div>
        )}
        {competitor.status === "scrape_failed" && (
          <div className="flex items-start gap-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Scrapování Meta Ads Library selhalo</p>
              <p className="text-amber-700 text-xs mt-0.5">Zkontrolujte, zda je zadaný odkaz na Meta Ads Library správný a veřejně dostupný. Analýza proběhla bez reklamních dat tohoto konkurenta.</p>
            </div>
          </div>
        )}
        {competitor.ads_count === 0 && competitor.status !== "scrape_failed" && competitor.status !== "processing" && (
          <div className="flex items-start gap-3 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-xl p-4">
            <AlertCircle className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-gray-700">Nenašli jsme aktivní Meta reklamy</p>
              <p className="text-gray-500 text-xs mt-0.5">
                {isEshop
                  ? "Pro vaši doménu právě neběží žádné aktivní reklamy na Meta (Facebook/Instagram), nebo se je nepodařilo načíst. Analýza se proto zaměřila na vaši konkurenci."
                  : "Pro tuto doménu právě neběží žádné aktivní reklamy na Meta (Facebook/Instagram), nebo se je nepodařilo načíst."}
              </p>
            </div>
          </div>
        )}

        {/* 3-block grid: Strategie / Kreativa / Aktivita */}
        {ai && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5" style={{ color }} />
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Strategie</span>
              </div>
              {ai.messaging.strategie_uctu ? (
                <p className="text-sm text-gray-700 leading-snug">{ai.messaging.strategie_uctu}</p>
              ) : (
                <p className="font-semibold text-gray-900 text-sm leading-snug">„{ai.messaging.hlavni_claim}"</p>
              )}
              {ai.messaging.tema_komunikace && (
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Téma: </span>
                  <span className="text-xs text-gray-500 italic">{ai.messaging.tema_komunikace}</span>
                </div>
              )}
              <div className="space-y-1.5 text-xs text-gray-500">
                <div className="flex justify-between gap-2">
                  <span>Emoce</span><span className="font-medium text-gray-700 text-right">{apeLabel(ai.messaging.dominantni_emocni_apel)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Funnel</span><span className="font-medium text-gray-700 text-right">{funnelLabel(ai.messaging.funnel_faze)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Oslovení</span><span className="font-medium text-gray-700 text-right">{ai.messaging.osloveni}</span>
                </div>
                {ai.messaging.socialni_dukaz?.length > 0 && (
                  <div className="flex justify-between gap-2">
                    <span>Soc. důkaz</span><span className="font-medium text-gray-700 text-right">{ai.messaging.socialni_dukaz.join(", ")}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Layers className="h-3.5 w-3.5" style={{ color }} />
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Kreativa</span>
              </div>
              {formatStr && (
                <p className="text-sm font-semibold text-gray-800">{formatStr}</p>
              )}
              <div className="space-y-1.5 text-xs text-gray-500">
                <div className="flex justify-between gap-2">
                  <span>Hook</span><span className="font-medium text-gray-700 text-right capitalize">{ai.kreativni_vzorce.nejcastejsi_hook}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Délka textu</span><span className="font-medium text-gray-700 text-right">{textLengthLabel(ai.kreativni_vzorce.prumerna_delka_textu)}</span>
                </div>
                {ai.landing_pages && (
                  <>
                    <div className="flex justify-between gap-2">
                      <span>Landing page</span><span className="font-medium text-gray-700 text-right">{lpLabel(ai.landing_pages.typ)}</span>
                    </div>
                    {ai.landing_pages.pouziva_slevy && (
                      <div className="flex justify-between gap-2">
                        <span>Slevy</span><span className="font-medium text-[#4f11ff]">Ano</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Activity className="h-3.5 w-3.5" style={{ color }} />
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Aktivita</span>
              </div>
              <div>
                <div className="font-[family-name:var(--font-heading)] text-3xl font-bold leading-none" style={{ color }}>
                  {ai.aktivita.pocet_aktivnich_reklam}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">aktivních reklam</div>
              </div>
              <div className="space-y-1.5 text-xs text-gray-500">
                <div className="flex justify-between gap-2">
                  <span>Prům. délka</span>
                  <span className="font-medium text-gray-700">{ai.aktivita.prumerna_delka_behu_dni > 0 ? `${ai.aktivita.prumerna_delka_behu_dni} dní` : "—"}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Frekvence</span><span className="font-medium text-gray-700">{freqLabel(ai.aktivita.frekvence_novych_reklam)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Top reklama */}
        {showTopReklama && (
          <div className="bg-gray-50 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="h-3.5 w-3.5" style={{ color }} />
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Top reklama</span>
            </div>
            <div className="flex gap-4 items-start">
              {topAd && (topAd.image_url || topAd.video_url) ? (
                <button
                  onClick={() => setSelectedAd(topAd)}
                  className="shrink-0 w-[100px] h-[100px] rounded-xl overflow-hidden bg-gray-200 border border-gray-200 hover:border-[#4f11ff]/40 hover:shadow-md transition-all"
                >
                  {topAd.video_url
                    ? <video src={topAd.video_url} poster={topAd.image_url || undefined} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                    : <img src={topAd.image_url!} alt="" className="w-full h-full object-cover" loading="lazy" />
                  }
                </button>
              ) : (
                <div className="shrink-0 w-[100px] h-[100px] rounded-xl flex items-center justify-center" style={{ background: `${color}15` }}>
                  <ImageIcon className="h-8 w-8" style={{ color: `${color}60` }} />
                </div>
              )}
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex gap-1.5 flex-wrap">
                  {topAd?.format && (
                    <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `${color}20`, color }}>
                      {topAd.format === "single_image" ? "Single image" : topAd.format === "video" ? "Video" : topAd.format === "carousel" ? "Carousel" : topAd.format}
                    </span>
                  )}
                  {daysInRotation !== null && (
                    <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full text-white" style={{ background: color }}>
                      {daysInRotation} dní v rotaci
                    </span>
                  )}
                </div>
                <p className="font-semibold text-gray-900 text-sm leading-snug">{ai!.kreativni_vzorce.top_reklama.popis}</p>
                <p className="text-xs text-gray-500 leading-relaxed">{ai!.kreativni_vzorce.top_reklama.proc_funguje}</p>
                <div className="flex gap-2 flex-wrap">
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: `${color}15`, color }}>
                    Hook: {ai!.kreativni_vzorce.nejcastejsi_hook}
                  </span>
                  <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                    Text: {textLengthLabel(ai!.kreativni_vzorce.prumerna_delka_textu)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Legacy summary fallback */}
        {!ai && sections.length > 0 && competitor.status !== "processing" && (
          <div className="space-y-5">
            {sections.map((s, i) => (
              <div key={i}>
                {s.title && <h3 className="text-xs font-bold uppercase tracking-wider text-[#4f11ff] mb-3">{s.title}</h3>}
                <MarkdownBullets text={s.body} />
              </div>
            ))}
          </div>
        )}
        {!ai && !sections.length && (competitor.status === "ready" || competitor.status === "empty") && (
          <p className="text-sm text-gray-400">Žádná data k zobrazení.</p>
        )}

        {/* Ads gallery */}
        {competitor.ads.length > 0 && (
          <div className="border-t border-gray-100 pt-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Všechny reklamy ({competitor.ads.length})
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {competitor.ads.map(ad => (
                <button
                  key={ad.id}
                  onClick={() => setSelectedAd(ad)}
                  className="group relative rounded-xl overflow-hidden bg-gray-100 aspect-square border border-gray-200 hover:border-[#4f11ff]/40 hover:shadow-md transition-all text-left"
                >
                  {ad.video_url
                    ? <video src={ad.video_url} poster={ad.image_url || undefined} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                    : ad.image_url
                      ? <img src={ad.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      : <div className="w-full h-full flex items-center justify-center"><ImageIcon className="h-5 w-5 text-gray-300" /></div>}
                  {ad.video_url && (
                    <div className="absolute bottom-1.5 right-1.5 bg-black/60 rounded-full p-0.5">
                      <Video className="h-2.5 w-2.5 text-white" />
                    </div>
                  )}
                  {ad.format && (
                    <div className="absolute bottom-1.5 left-1.5 text-white font-medium leading-none" style={{ background: "rgba(0,0,0,0.7)", fontSize: 11, padding: "4px 8px", borderRadius: 4 }}>
                      {ad.format === "single_image" ? "Image" : ad.format === "video" ? "Video" : ad.format === "carousel" ? "Carousel" : ad.format}
                    </div>
                  )}
                  {ad.is_active && <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#b0f221] shadow-sm" />}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex flex-col justify-end p-1.5 opacity-0 group-hover:opacity-100">
                    <AdTypePill type={ad.ad_type} />
                    {adDisplayText(ad) && <p className="text-white text-[9px] mt-0.5 line-clamp-2 leading-tight">{adDisplayText(ad)}</p>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {selectedAd && <AdModal ad={selectedAd} onClose={() => setSelectedAd(null)} />}
    </section>
  );
}

// ─── Send-report dialog ───────────────────────────────────────────────────────

type SendState = "idle" | "sending" | "done" | "error";

function SendReportDialog({ sessionId, open, onClose }: { sessionId: string; open: boolean; onClose: () => void }) {
  const [state, setState] = useState<SendState>("idle");
  const handleSend = async () => {
    setState("sending");
    const { error } = await supabase.functions.invoke("send-lm-report", { body: { session_id: sessionId } });
    setState(error ? "error" : "done");
  };
  return (
    <Dialog.Root open={open} onOpenChange={o => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in-0" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl z-50 w-full max-w-sm shadow-2xl p-6 animate-in fade-in-0 zoom-in-95">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#4f11ff]/8 border border-[#4f11ff]/15 flex items-center justify-center shrink-0">
              <Mail className="h-5 w-5 text-[#4f11ff]" />
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors shrink-0">
              <X className="h-4 w-4 text-gray-400" />
            </button>
          </div>
          {state === "done" ? (
            <div className="text-center py-2">
              <div className="w-12 h-12 rounded-full bg-[#b0f221]/20 flex items-center justify-center mx-auto mb-3">
                <Check className="h-6 w-6 text-[#4f11ff]" />
              </div>
              <p className="font-semibold text-gray-900 mb-1">Email odeslán!</p>
              <p className="text-sm text-gray-500">Analýza dorazí na váš email do pár minut.</p>
              <button onClick={onClose} className="mt-4 w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-xl text-sm transition-colors">Zavřít</button>
            </div>
          ) : (
            <>
              <Dialog.Title className="font-[family-name:var(--font-heading)] font-bold text-gray-900 text-lg mb-1">Odeslat analýzu na email</Dialog.Title>
              <p className="text-sm text-gray-500 mb-5">Pošleme vám shrnutí s výsledky na email, který jste zadali při registraci.</p>
              {state === "error" && <p className="text-sm text-red-500 mb-3">Odesílání se nezdařilo. Zkuste to znovu.</p>}
              <div className="flex gap-2">
                <button onClick={onClose} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-xl text-sm transition-colors">Zrušit</button>
                <button onClick={handleSend} disabled={state === "sending"} className="flex-1 flex items-center justify-center gap-2 bg-[#b0f221] hover:bg-[#a3e01e] disabled:opacity-60 text-gray-900 font-semibold py-2.5 rounded-xl text-sm transition-colors">
                  {state === "sending" ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Odeslat"}
                </button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ResultsPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const completedFiredRef = useRef(false);

  const { data, isLoading, isError, isSuccess } = useQuery<AnalysisResults>({
    queryKey: ["lm-results", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-lm-results", { body: { session_id: sessionId } });
      if (error) throw error;
      return data as AnalysisResults;
    },
    enabled: !!sessionId,
    retry: 1,
    // Refetchuj, dokud session není v terminálním stavu — ať se stránka vždy
    // sama dotáhne do finálu a nezamrzne na přechodném snímku (processing/analyzing).
    refetchInterval: q => ["ready", "completed", "failed"].includes(q.state.data?.status ?? "") ? false : 5000,
    placeholderData: MOCK,
  });

  useEffect(() => {
    if (completedFiredRef.current) return;
    if (!isSuccess || !data || data === MOCK) return;
    if (data.status === "processing") return;
    completedFiredRef.current = true;
    const totalAds = data.competitors.reduce((s, c) => s + c.ads_count, 0);
    trackEvent({ event: "analysis_completed", session_id: sessionId ?? null, ads_count_total: totalAds, ...(getUtmData() ?? {}) });
  }, [isSuccess, data, sessionId]);

  const results = data ?? MOCK;
  const cross = results.ai_cross_analysis;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-[family-name:var(--font-body)]">

      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100 print:hidden">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <img src={performindLogo} alt="Performind Marketing" className="h-5 object-contain shrink-0" />
            <span className="hidden sm:flex items-center gap-1.5 bg-[#4f11ff]/8 text-[#4f11ff] text-xs font-semibold px-2.5 py-1 rounded-full border border-[#4f11ff]/15 tracking-wide uppercase">
              Analýza konkurence
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href="https://calendar.app.google/GDJZhgABwHo4i4qx6"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent({ event: "cta_clicked", cta_label: "booking_nav", context: "booking", session_id: sessionId ?? null })}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-900 bg-[#b0f221] hover:bg-[#a3e01e] px-3 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <CalendarCheck className="h-3.5 w-3.5 shrink-0" /> Rezervovat hovor
            </a>
            <button
              onClick={() => setEmailDialogOpen(true)}
              aria-label="Odeslat analýzu na e-mail"
              title="Odeslat na mail"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 px-2.5 sm:px-3 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Mail className="h-3.5 w-3.5 shrink-0" /> <span className="hidden sm:inline">Odeslat na mail</span>
            </button>
          </div>
        </div>
      </nav>

      {sessionId && <SendReportDialog sessionId={sessionId} open={emailDialogOpen} onClose={() => setEmailDialogOpen(false)} />}

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">

        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 bg-[#b0f221]/20 text-gray-700 text-xs font-semibold px-4 py-1.5 rounded-full tracking-wide uppercase">
            Konkurenční analýza
          </div>
          <h1 className="font-[family-name:var(--font-heading)] text-3xl sm:text-4xl font-bold text-gray-900">
            Vaše konkurence<br className="sm:hidden" /> pod lupou
          </h1>
          <p className="text-gray-500 text-sm max-w-md mx-auto">
            Nascrapovali jsme {adVolumeTotal(results.eshop_competitor, results.competitors)} aktivních reklam
            (vaše i {results.competitors.length} konkurentů) a analyzovali je pomocí AI.
          </p>
        </div>

        {isLoading && !data && (
          <div className="flex items-center justify-center gap-3 py-16 text-gray-400">
            <RefreshCw className="h-5 w-5 animate-spin" /><span>Načítám výsledky…</span>
          </div>
        )}

        {isError && !data && (
          <div className="text-center py-16 text-gray-400 text-sm">Nepodařilo se načíst výsledky. Zkuste obnovit stránku.</div>
        )}

        {data?.status === "processing" && (
          <div className="flex items-center gap-3 rounded-2xl border border-[#4f11ff]/20 bg-[#4f11ff]/5 px-5 py-4 text-sm text-[#4f11ff]">
            <RefreshCw className="h-4 w-4 animate-spin shrink-0" />
            Analýza stále probíhá — výsledky se automaticky aktualizují.
          </div>
        )}

        {/* Objem reklam — neutrální přehled (velké číslo + donut po hráčích) */}
        <AdVolumeDonut eshopCompetitor={results.eshop_competitor} competitors={results.competitors} />

        {/* Cross synthesis */}
        <CrossAnalysisHero cross={cross ?? null} eshopName={results.eshop_name} competitors={results.competitors} />

        {/* Positioning radar + quick wins */}
        {cross?.pozice_zadavatele && cross?.quick_wins && (
          <PositioningSection cross={cross} eshopName={results.eshop_name} eshopCompetitor={results.eshop_competitor} competitors={results.competitors} />
        )}

        {/* Ad mix comparison chart */}
        {(results.competitors.length > 0 || results.eshop_competitor) && (() => {
          const mixPlayers = [
            ...(results.eshop_competitor ? [{ ...results.eshop_competitor, name: results.eshop_name }] : []),
            ...results.competitors,
          ];
          const allEmpty = mixPlayers.every(c => c.ad_mix.brand === 0 && c.ad_mix.sales === 0 && c.ad_mix.retargeting === 0);
          return (
            <section className="bg-white rounded-3xl border border-gray-100 p-6 sm:p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-9 h-9 rounded-xl bg-[#4f11ff]/8 border border-[#4f11ff]/15 flex items-center justify-center shrink-0">
                  <Layers className="h-4 w-4 text-[#4f11ff]" />
                </div>
                <div>
                  <h2 className="font-[family-name:var(--font-heading)] font-bold text-gray-900">Reklamní mix</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Rozložení brand / akvizice / retargeting reklam na Meta</p>
                </div>
              </div>
              {allEmpty ? (
                <p className="text-sm text-gray-400 text-center py-8">Data o reklamním mixu nejsou k dispozici.</p>
              ) : (
                <ComparisonChart competitors={mixPlayers} />
              )}
              <p className="text-xs text-gray-400 mt-4 flex items-center gap-1.5">
                <AlertCircle className="h-3 w-3 shrink-0" />
                Google Ads analýza bude dostupná brzy.
              </p>
            </section>
          );
        })()}

        {/* Eshop (Váš e-shop) — zobraz i s 0 reklamami (graceful hláška, ne tichý skryt) */}
        {results.eshop_competitor && (
          <CompetitorSection competitor={{ ...results.eshop_competitor, name: results.eshop_name }} index={0} isEshop />
        )}

        {/* Per-competitor */}
        {results.competitors.map((competitor, i) => (
          <CompetitorSection key={competitor.id} competitor={competitor} index={i} />
        ))}

        {/* CTA — booking call (statický lime podkres, těsně přilehlý) */}
        <div className="relative">
          <section
            className="relative rounded-3xl bg-gray-900 text-white p-8 sm:p-10 text-center print:hidden"
            style={{ border: "1.5px solid rgba(176,242,33,0.35)", boxShadow: "0 0 28px -2px rgba(176,242,33,0.50), 0 0 8px 0 rgba(176,242,33,0.30)" }}
          >
          <h2 className="font-[family-name:var(--font-heading)] text-2xl sm:text-3xl font-bold mb-4">
            Tohle je jen špička ledovce.<br />
            Pojďme z dat udělat plán.
          </h2>
          <p className="text-gray-400 max-w-lg mx-auto text-sm sm:text-base leading-relaxed mb-8">
            Většina lidí si analýzu uloží a více se k ní nevrátí.
            <br /><br />
            Ne proto, že by nechtěli růst, ale proměnit čísla v konkrétní kroky není vždy snadné.
            <br /><br />
            Na hovoru to uděláme za vás.
          </p>

          <ul className="max-w-md mx-auto space-y-3 text-left mb-8">
            {[
              "Projdeme výsledky a vysvětlíme, co znamenají pro váš e-shop",
              "Řekneme vám 2 konkrétní body, které můžete ihned aplikovat",
              "30 minut, online, bez závazku a bez prodejního tlaku",
            ].map((t) => (
              <li key={t} className="flex items-start gap-3">
                <span className="shrink-0 mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#b0f221]/20">
                  <Check className="h-3.5 w-3.5 text-[#b0f221]" />
                </span>
                <span className="text-gray-200 text-sm leading-relaxed">{t}</span>
              </li>
            ))}
          </ul>

          {/* Fotka vedle CTA (ne nahoře) — táhne na akci; zelený online indikátor v rohu */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <div className="relative shrink-0">
              <img
                src="/daniel-sojak.jpg"
                alt="Daniel Soják, zakladatel Performind"
                className="w-14 h-14 rounded-full object-cover ring-2 ring-white/20 shadow-lg"
              />
              <span
                aria-hidden
                title="Online"
                className="online-dot absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#22c55e] ring-2 ring-gray-900"
              />
            </div>
            <a
              href="https://calendar.app.google/GDJZhgABwHo4i4qx6"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent({ event: "cta_clicked", cta_label: "booking_results", context: "booking", session_id: sessionId ?? null })}
              className="inline-flex items-center justify-center gap-2 bg-[#b0f221] text-gray-900 font-semibold px-8 py-4 rounded-xl hover:bg-[#a3e01e] transition-colors text-base shadow-lg shadow-[#b0f221]/20"
            >
              Rezervovat bezplatný hovor <ArrowRight className="h-4 w-4" />
            </a>
          </div>
          <p className="text-gray-500 text-xs mt-3">30 minut · zdarma · žádný závazek</p>
          </section>
        </div>

      </main>

      <footer className="border-t border-gray-200 py-6 px-6 text-center bg-white mt-10">
        <p className="text-gray-400 text-xs">© {new Date().getFullYear()} Performind Marketing s.r.o.</p>
      </footer>
    </div>
  );
}
