import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import {
  ExternalLink, Globe, Layers, Video, Image as ImageIcon, TrendingUp,
  Megaphone, ShoppingBag, ArrowRight, RefreshCw, Mail, Printer, X, Check,
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
  ad_type: "brand" | "sales" | "retargeting" | null;
  ad_source: "meta" | "google";
  is_active: boolean;
  ad_start_date: string | null;
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
    hlavni_claim: string;
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
  status: "ready" | "processing" | "failed" | "empty";
  ads_count: number;
  ad_mix: { brand: number; sales: number; retargeting: number };
  ads: AdItem[];
}

interface AnalysisResults {
  status?: string;
  eshop_name: string;
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

function AdTypePill({ type }: { type: string | null }) {
  if (!type) return null;
  const label = TYPE_LABELS[type as keyof typeof TYPE_LABELS] || type;
  const bg = type === "brand" ? "bg-[#4f11ff]/10 text-[#4f11ff]" : type === "sales" ? "bg-[#b0f221]/30 text-gray-800" : "bg-amber-100 text-amber-700";
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${bg}`}>{label}</span>;
}

// ─── Charts ───────────────────────────────────────────────────────────────────

function AdMixDonut({ mix }: { mix: { brand: number; sales: number; retargeting: number } }) {
  const data = [
    { name: "Brand", value: mix.brand, color: TYPE_COLORS.brand },
    { name: "Akvizice", value: mix.sales, color: TYPE_COLORS.sales },
    { name: "Retargeting", value: mix.retargeting, color: TYPE_COLORS.retargeting },
  ].filter(d => d.value > 0);
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-28 h-28">
        <PieChart width={112} height={112}>
          <Pie data={data} cx={52} cy={52} innerRadius={32} outerRadius={52} dataKey="value" strokeWidth={0}>
            {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Pie>
        </PieChart>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-semibold text-gray-500">{total} reklam</span>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        {data.map(d => (
          <div key={d.name} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
            {d.name} <span className="font-semibold text-gray-900">{Math.round((d.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComparisonChart({ competitors }: { competitors: CompetitorResult[] }) {
  const data = competitors.map(c => {
    const total = c.ad_mix.brand + c.ad_mix.sales + c.ad_mix.retargeting;
    return {
      name: c.name.length > 14 ? c.name.slice(0, 14) + "…" : c.name,
      Brand: total ? Math.round((c.ad_mix.brand / total) * 100) : 0,
      Akvizice: total ? Math.round((c.ad_mix.sales / total) * 100) : 0,
      Retargeting: total ? Math.round((c.ad_mix.retargeting / total) * 100) : 0,
    };
  });
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" barCategoryGap="30%">
        <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#374151", fontWeight: 500 }} axisLine={false} tickLine={false} width={90} />
        <Tooltip formatter={(v: number, name: string) => [`${v}%`, name]} contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 12 }} />
        <Bar dataKey="Brand" stackId="a" fill={TYPE_COLORS.brand} />
        <Bar dataKey="Akvizice" stackId="a" fill={TYPE_COLORS.sales} />
        <Bar dataKey="Retargeting" stackId="a" fill={TYPE_COLORS.retargeting} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function PositioningRadar({ radar }: { radar: AiCrossAnalysis["pozice_zadavatele"]["radar"] }) {
  const data = [
    { subject: "Objem reklam", value: radar.objem_reklam },
    { subject: "Kreativita", value: radar.kreativni_diverzita },
    { subject: "Messaging", value: radar.messaging_jasnost },
    { subject: "Brand", value: radar.brand_konzistence },
    { subject: "Funnel", value: radar.funnel_pokryti },
  ];
  return (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
        <PolarGrid stroke="#e5e7eb" />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "#6b7280" }} />
        <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
        <Radar name="Váš e-shop" dataKey="value" stroke="#4f11ff" fill="#4f11ff" fillOpacity={0.15} strokeWidth={2} />
      </RadarChart>
    </ResponsiveContainer>
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

function PositioningSection({ cross, eshopName }: { cross: AiCrossAnalysis; eshopName: string }) {
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
          <PositioningRadar radar={pos.radar} />
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

function MessagingCard({ ai }: { ai: AiAnalysis }) {
  const { messaging, aktivita, kreativni_vzorce } = ai;

  const apeLabel = (a: string) => ({ strach: "⚠️ Strach", touha: "✨ Touha", logika: "🧠 Logika", humor: "😄 Humor", komunita: "👥 Komunita" }[a] || a);
  const funnelLabel = (f: string) => ({ awareness: "Awareness", consideration: "Consideration", conversion: "Conversion", mix: "Celý funnel" }[f] || f);

  return (
    <div className="grid sm:grid-cols-3 gap-4 text-sm">
      <div className="bg-gray-50 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare className="h-3.5 w-3.5 text-[#4f11ff]" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Messaging</span>
        </div>
        <p className="font-semibold text-gray-900 mb-2 leading-snug">„{messaging.hlavni_claim}"</p>
        <div className="space-y-1 text-xs text-gray-500">
          <div className="flex justify-between"><span>Emoce</span><span className="font-medium text-gray-700">{apeLabel(messaging.dominantni_emocni_apel)}</span></div>
          <div className="flex justify-between"><span>Funnel</span><span className="font-medium text-gray-700">{funnelLabel(messaging.funnel_faze)}</span></div>
          <div className="flex justify-between"><span>Oslovení</span><span className="font-medium text-gray-700">{messaging.osloveni}</span></div>
          {messaging.socialni_dukaz?.length > 0 && (
            <div className="flex justify-between"><span>Soc. důkaz</span><span className="font-medium text-gray-700">{messaging.socialni_dukaz.join(", ")}</span></div>
          )}
        </div>
      </div>

      <div className="bg-gray-50 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-3.5 w-3.5 text-[#4f11ff]" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Aktivita</span>
        </div>
        <div className="space-y-2 text-xs text-gray-500">
          <div>
            <div className="font-[family-name:var(--font-heading)] text-2xl font-bold text-[#4f11ff]">{aktivita.pocet_aktivnich_reklam}</div>
            <div>aktivních reklam</div>
          </div>
          <div className="flex justify-between"><span>Prům. délka</span><span className="font-medium text-gray-700">{aktivita.prumerna_delka_behu_dni} dní</span></div>
          <div className="flex justify-between"><span>Frekvence</span><span className="font-medium text-gray-700">{aktivita.frekvence_novych_reklam}</span></div>
        </div>
      </div>

      <div className="bg-gray-50 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb className="h-3.5 w-3.5 text-[#4f11ff]" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Top reklama</span>
        </div>
        <p className="font-semibold text-gray-900 text-xs mb-1 leading-snug">{kreativni_vzorce.top_reklama.popis}</p>
        <p className="text-xs text-gray-500 leading-relaxed">{kreativni_vzorce.top_reklama.proc_funguje}</p>
        <div className="flex gap-2 mt-3 flex-wrap">
          <span className="text-[10px] bg-[#4f11ff]/8 text-[#4f11ff] px-2 py-0.5 rounded-full font-medium">Hook: {kreativni_vzorce.nejcastejsi_hook}</span>
          <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Text: {kreativni_vzorce.prumerna_delka_textu}</span>
        </div>
      </div>
    </div>
  );
}

function CompetitorSection({ competitor, index }: { competitor: CompetitorResult; index: number }) {
  const sections = competitor.summary ? parseMarkdown(competitor.summary) : [];
  const typeIcon = (t: string) => t === "brand" ? Megaphone : t === "sales" ? ShoppingBag : TrendingUp;

  return (
    <section className="rounded-3xl border border-gray-100 bg-white overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-6 sm:px-8 py-5 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-[#4f11ff]/8 border border-[#4f11ff]/15 flex items-center justify-center text-sm font-bold text-[#4f11ff] font-[family-name:var(--font-heading)]">
            {index + 1}
          </span>
          <div>
            <h2 className="font-[family-name:var(--font-heading)] font-bold text-gray-900 text-lg">{competitor.name}</h2>
            {competitor.website_url && (
              <a href={competitor.website_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-[#4f11ff] transition-colors mt-0.5">
                <Globe className="h-3 w-3" />{competitor.website_url.replace(/^https?:\/\//, "")}<ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
        </div>
        <span className="text-sm text-gray-500">{competitor.ads_count} reklam</span>
      </div>

      <div className="p-6 sm:p-8 space-y-8">
        {/* Ad mix + AI messaging */}
        <div className="grid lg:grid-cols-[220px_1fr] gap-8">
          <div className="space-y-6">
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Reklamní mix</h3>
              <AdMixDonut mix={competitor.ad_mix} />
            </div>
            <div className="space-y-2">
              {(["brand", "sales", "retargeting"] as const).map(type => {
                const total = competitor.ad_mix.brand + competitor.ad_mix.sales + competitor.ad_mix.retargeting;
                const val = competitor.ad_mix[type];
                const pct = total ? Math.round((val / total) * 100) : 0;
                const Icon = typeIcon(type);
                return (
                  <div key={type} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: typeColor(type) + "18" }}>
                      <Icon className="h-3.5 w-3.5" style={{ color: typeColor(type) }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium text-gray-700">{TYPE_LABELS[type]}</span>
                        <span className="font-bold text-gray-900">{pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: typeColor(type) }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AI messaging & activity */}
          <div className="space-y-5">
            {competitor.status === "processing" && (
              <div className="flex items-center gap-3 text-sm text-gray-500 bg-gray-50 rounded-xl p-4">
                <RefreshCw className="h-4 w-4 animate-spin text-[#4f11ff]" /> Generuji analýzu…
              </div>
            )}
            {competitor.status === "failed" && (
              <div className="text-sm text-red-500 bg-red-50 rounded-xl p-4">Analýza selhala.</div>
            )}
            {competitor.ai_analysis ? (
              <MessagingCard ai={competitor.ai_analysis} />
            ) : sections.length > 0 ? (
              sections.map((s, i) => (
                <div key={i}>
                  {s.title && <h3 className="text-xs font-bold uppercase tracking-wider text-[#4f11ff] mb-3">{s.title}</h3>}
                  <MarkdownBullets text={s.body} />
                </div>
              ))
            ) : (competitor.status === "ready" || competitor.status === "empty") ? (
              <p className="text-sm text-gray-400">Žádná data k zobrazení.</p>
            ) : null}
          </div>
        </div>

        {/* Ads grid */}
        {competitor.ads.length > 0 && (
          <div className="border-t border-gray-100 pt-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Ukázka reklam ({competitor.ads.length})</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {competitor.ads.map(ad => (
                <div key={ad.id} className="group relative rounded-xl overflow-hidden bg-gray-100 aspect-square border border-gray-200">
                  {ad.video_url
                    ? <video src={ad.video_url} poster={ad.image_url || undefined} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                    : ad.image_url
                      ? <img src={ad.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      : <div className="w-full h-full flex items-center justify-center"><ImageIcon className="h-6 w-6 text-gray-300" /></div>}
                  {ad.video_url && <div className="absolute top-2 right-2"><Video className="h-3.5 w-3.5 text-white drop-shadow" /></div>}
                  <AdSourceBadge source={ad.ad_source} />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-all flex flex-col justify-end p-2 opacity-0 group-hover:opacity-100">
                    <AdTypePill type={ad.ad_type} />
                    {ad.primary_text && <p className="text-white text-[10px] mt-1 line-clamp-3 leading-tight">{ad.primary_text}</p>}
                  </div>
                  {ad.is_active && <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#b0f221] shadow" />}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
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
                <button onClick={handleSend} disabled={state === "sending"} className="flex-1 flex items-center justify-center gap-2 bg-[#4f11ff] hover:bg-[#3d0dcc] disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
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

  const { data, isLoading, isError } = useQuery<AnalysisResults>({
    queryKey: ["lm-results", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-lm-results", { body: { session_id: sessionId } });
      if (error) throw error;
      return data as AnalysisResults;
    },
    enabled: !!sessionId,
    retry: 1,
    refetchInterval: q => q.state.data?.status === "processing" ? 6000 : false,
    placeholderData: MOCK,
  });

  const results = data ?? MOCK;
  const cross = results.ai_cross_analysis;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-[family-name:var(--font-body)]">

      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100 print:hidden">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <img src={performindLogo} alt="Performind Studio" className="h-6 object-contain" />
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors">
              <Printer className="h-3.5 w-3.5" /> Uložit PDF
            </button>
            <button onClick={() => setEmailDialogOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[#4f11ff] hover:bg-[#3d0dcc] px-3 py-1.5 rounded-lg transition-colors">
              <Mail className="h-3.5 w-3.5" /> Odeslat na mail
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
            Nascrapovali jsme {results.competitors.reduce((s, c) => s + c.ads_count, 0)} reklam
            od {results.competitors.length} konkurentů a analyzovali je pomocí AI.
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

        {/* Cross synthesis */}
        <CrossAnalysisHero cross={cross ?? null} eshopName={results.eshop_name} competitors={results.competitors} />

        {/* Positioning radar + quick wins */}
        {cross?.pozice_zadavatele && cross?.quick_wins && (
          <PositioningSection cross={cross} eshopName={results.eshop_name} />
        )}

        {/* Overall comparison chart */}
        {results.competitors.length >= 2 && (
          <section className="bg-white rounded-3xl border border-gray-100 p-6 sm:p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl bg-[#4f11ff]/8 border border-[#4f11ff]/15 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-[#4f11ff]" />
              </div>
              <div>
                <h2 className="font-[family-name:var(--font-heading)] font-bold text-gray-900">Reklamní mix: akvizice vs. brand</h2>
                <p className="text-xs text-gray-400 mt-0.5">Kdo sází na okamžitý výkon a kdo buduje značku</p>
              </div>
            </div>
            <ComparisonChart competitors={results.competitors} />
            <div className="flex flex-wrap gap-4 mt-4 justify-center text-xs text-gray-500">
              {(["brand", "sales", "retargeting"] as const).map(t => (
                <span key={t} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: typeColor(t) }} />
                  {TYPE_LABELS[t]}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Per-competitor */}
        {results.competitors.map((competitor, i) => (
          <CompetitorSection key={competitor.id} competitor={competitor} index={i} />
        ))}

        {/* CTA */}
        <section className="rounded-3xl bg-gray-900 text-white p-8 sm:p-10 text-center space-y-4 print:hidden">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 mb-2">
            <Layers className="h-7 w-7 text-[#b0f221]" />
          </div>
          <h2 className="font-[family-name:var(--font-heading)] text-2xl sm:text-3xl font-bold">
            Víte, co dělá konkurence.<br />Co uděláte vy?
          </h2>
          <p className="text-gray-400 max-w-md mx-auto text-sm leading-relaxed">
            Naši stratégové přeloží tato data do konkrétního kreativního briefu a mediálního plánu přímo pro váš e-shop.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <a href="https://performind.cz" target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 bg-[#b0f221] text-black font-semibold px-6 py-3.5 rounded-xl hover:bg-[#9de01a] transition-colors text-sm">
              Chci strategii pro svůj e-shop <ArrowRight className="h-4 w-4" />
            </a>
            <a href="mailto:hello@performind.cz" className="inline-flex items-center justify-center gap-2 bg-white/10 text-white font-semibold px-6 py-3.5 rounded-xl hover:bg-white/20 transition-colors text-sm">
              Napsat nám
            </a>
          </div>
        </section>

      </main>

      <footer className="border-t border-gray-200 py-6 px-6 text-center bg-white mt-10">
        <p className="text-gray-400 text-xs">© {new Date().getFullYear()} Performind Studio s.r.o.</p>
      </footer>
    </div>
  );
}
