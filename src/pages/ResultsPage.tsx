import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { ExternalLink, Globe, Layers, Video, Image as ImageIcon, TrendingUp, Megaphone, ShoppingBag, ArrowRight, RefreshCw } from "lucide-react";
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

interface CompetitorResult {
  id: string;
  name: string;
  website_url: string | null;
  summary: string | null;
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
}

// ─── Mock data (used until backend is ready) ──────────────────────────────────

const MOCK: AnalysisResults = {
  eshop_name: "Váš e-shop",
  cross_summary: `### Společná témata a úhly
- **Sociální důkaz jako základ** — všichni konkurenti staví první reklamy na recenzích a hodnocení zákazníků; v tomto segmentu je to nutnost, ne diferenciace
- **Urgency ve sales reklamách** — fráze „pouze dnes", „posledních X kusů" a odpočítávání se opakují u každého; funguje to, ale ztrácí sílu s nasyceností trhu
- **Before/after formát** — vizuální transformace je dominantní hook u brand reklam; 2 ze 3 konkurentů ho používají v 60 %+ brand kampaní

### Společné formáty a CTA
- **Krátké video 15–30s** — přes 70 % video reklam je kratší než 30 sekund; delší formáty testuje pouze jeden konkurent
- **„Zjistit více" vs. „Koupit nyní"** — brand reklamy téměř výhradně používají měkké CTA, sales tvrdé; žádný z konkurentů nemixuje
- **Statické single-image** — stále dominují u sales formátů navzdory rostoucímu tlaku na video

### Co prokazatelně funguje všem
- **Nejdéle běžící reklamy jsou vždy testimonial nebo before/after** — průměrná délka těchto formátů je 3× vyšší než u ostatních typů
- **Emoji v prvních 5 znacích textu** — všichni to dělají, zvyšuje to pravděpodobnost zastavení scrollování
- **Mobilní kompozice** — produkty v horní třetině framu, text v dolní; standardizovaný vzorec pro mobile-first placement

### Mezera / příležitost
- **Nikdo nevysvětluje „proč zrovna teď"** — urgency je přítomná, ale vychází ze slevy, ne z kontextu zákazníka; příběhová urgency (sezóna, životní situace) je neobsazená
- **Video delší než 60s chybí** — nikdo netestuje vzdělávací nebo hloubkový formát, přestože segment má potenciál pro high-consideration zákazníky`,
  competitors: [
    {
      id: "c1",
      name: "Konkurent A",
      website_url: "https://konkurent-a.cz",
      status: "ready",
      ads_count: 42,
      ad_mix: { brand: 38, sales: 48, retargeting: 14 },
      summary: `### Kreativy
- **Čistý, minimalistický vizuál** — bílé pozadí, produkt v centru, žádný ruch; výrazný kontrast s ostatními v segmentu
- **Video hooky přes problém** — každé video otevírá bolestí zákazníka v prvních 3 sekundách, teprve pak produkt
- **Konzistentní barevná paleta** — šedá + akcentová barva značky ve všech formátech; okamžitá rozpoznatelnost

### Textace
- **Krátké, úderné texty** — průměrně 2–3 věty; žádné dlouhé odstavce; čtivost na první pohled
- **Přímé oslovení „ty"** — veškerá komunikace je konverzační, bez formálního vykání
- **Číselné důkazy** — „93 % zákazníků", „za 14 dní" — konkrétní čísla v každé sales reklamě

### Strategie a top reklama
- **Mix typů:** 38 % brand, 48 % sales, 14 % retargeting — výrazně výkonnostní orientace
- **Hlavní úhly:** rychlost výsledků, sociální důkaz čísly, jednoduchost použití
- **Top reklama:** testimonial video s číselným výsledkem v titulku — běží 67 dní; insight: číslo v prvních 3 sekundách = zástava scrollu`,
      ads: [
        { id: "a1", image_url: "https://picsum.photos/seed/ad1/400/400", video_url: null, primary_text: "93 % zákazníků vidí výsledky do 14 dní. Zjistěte proč.", ad_type: "sales", ad_source: "meta", is_active: true, ad_start_date: "2026-03-01" },
        { id: "a2", image_url: "https://picsum.photos/seed/ad2/400/400", video_url: null, primary_text: "Před a po. Výsledky, které mluví samy za sebe.", ad_type: "brand", ad_source: "meta", is_active: true, ad_start_date: "2026-02-15" },
        { id: "a3", image_url: "https://picsum.photos/seed/ad3/400/400", video_url: null, primary_text: "Zapomněli jste? Váš košík na vás čeká.", ad_type: "retargeting", ad_source: "google", is_active: false, ad_start_date: "2026-01-20" },
        { id: "a4", image_url: "https://picsum.photos/seed/ad4/400/400", video_url: null, primary_text: "Limitovaná nabídka — jen do konce týdne.", ad_type: "sales", ad_source: "meta", is_active: true, ad_start_date: "2026-04-10" },
        { id: "a5", image_url: "https://picsum.photos/seed/ad5/400/400", video_url: null, primary_text: "Přidejte se k 12 000 spokojeným zákazníkům.", ad_type: "brand", ad_source: "google", is_active: true, ad_start_date: "2026-03-22" },
        { id: "a6", image_url: "https://picsum.photos/seed/ad6/400/400", video_url: null, primary_text: "Jednoduché. Rychlé. Efektivní.", ad_type: "brand", ad_source: "meta", is_active: true, ad_start_date: "2026-04-01" },
      ],
    },
    {
      id: "c2",
      name: "Konkurent B",
      website_url: "https://konkurent-b.cz",
      status: "ready",
      ads_count: 31,
      ad_mix: { brand: 55, sales: 32, retargeting: 13 },
      summary: `### Kreativy
- **Lifestyle fotografie** — produkty vždy v kontextu použití, ne na bílém pozadí; silnější emocionální nabití
- **UGC jako základ** — většina brand reklam vypadá jako organický obsah; nižší produkční hodnota je záměrná
- **Carousel formát dominuje** — přes 60 % reklam je carousel; testují více produktů/benefitů v jedné reklamě

### Textace
- **Delší texty s příběhem** — průměrně 5–8 vět; budují kontext před nabídkou
- **Otázky jako hooky** — texty začínají otázkou adresující zákazníkův problém v 70 % případů
- **Emocionální jazyk** — slova jako „konečně", „znáte ten pocit?", „změnilo to můj život"

### Strategie a top reklama
- **Mix typů:** 55 % brand, 32 % sales, 13 % retargeting — brand-first strategie; budují nejprve důvěru
- **Hlavní úhly:** identifikace s cílovou skupinou, komunita, životní styl
- **Top reklama:** UGC video „Den se zákaznicí" — 89 dní v rotaci; insight: autentičnost překonává produkci v brand kampani`,
      ads: [
        { id: "b1", image_url: "https://picsum.photos/seed/b1/400/400", video_url: null, primary_text: "Znáte ten pocit, když konečně najdete to pravé?", ad_type: "brand", ad_source: "meta", is_active: true, ad_start_date: "2026-02-01" },
        { id: "b2", image_url: "https://picsum.photos/seed/b2/400/400", video_url: null, primary_text: "Změnilo to můj každodenní rutinu. Tady je jak.", ad_type: "brand", ad_source: "meta", is_active: true, ad_start_date: "2026-03-10" },
        { id: "b3", image_url: "https://picsum.photos/seed/b3/400/400", video_url: null, primary_text: "Speciální nabídka pro nové zákazníky — 20 % sleva.", ad_type: "sales", ad_source: "google", is_active: true, ad_start_date: "2026-04-05" },
        { id: "b4", image_url: "https://picsum.photos/seed/b4/400/400", video_url: null, primary_text: "Stále přemýšlíte? Tady jsou odpovědi na vaše otázky.", ad_type: "retargeting", ad_source: "meta", is_active: false, ad_start_date: "2026-01-15" },
        { id: "b5", image_url: "https://picsum.photos/seed/b5/400/400", video_url: null, primary_text: "Přes 8 000 zákazníků nemůže mýlit.", ad_type: "brand", ad_source: "meta", is_active: true, ad_start_date: "2026-03-28" },
        { id: "b6", image_url: "https://picsum.photos/seed/b6/400/400", video_url: null, primary_text: "Výprodej — poslední kusy skladem.", ad_type: "sales", ad_source: "google", is_active: true, ad_start_date: "2026-04-12" },
      ],
    },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_COLORS = {
  brand: "#4f11ff",
  sales: "#b0f221",
  retargeting: "#f59e0b",
} as const;

const TYPE_LABELS = { brand: "Brand", sales: "Akvizice", retargeting: "Retargeting" };

function typeColor(t: string | null) {
  if (t === "brand") return TYPE_COLORS.brand;
  if (t === "sales") return TYPE_COLORS.sales;
  if (t === "retargeting") return TYPE_COLORS.retargeting;
  return "#d1d5db";
}

function parseMarkdown(text: string): { title: string; body: string }[] {
  const sections: { title: string; body: string }[] = [];
  const parts = text.split(/^###\s+/m).filter((p) => p.trim());
  if (parts.length > 0 && /^###\s+/m.test(text)) {
    for (const p of parts) {
      const nl = p.indexOf("\n");
      sections.push({
        title: (nl === -1 ? p : p.slice(0, nl)).trim(),
        body: nl === -1 ? "" : p.slice(nl + 1).trim(),
      });
    }
  } else {
    sections.push({ title: "", body: text });
  }
  return sections;
}

function MarkdownBullets({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
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
  ].filter((d) => d.value > 0);

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
        {data.map((d) => (
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
  const data = competitors.map((c) => {
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
        <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#374151", fontWeight: 500 }} axisLine={false} tickLine={false} width={90} />
        <Tooltip
          formatter={(v: number, name: string) => [`${v}%`, name]}
          contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 12 }}
        />
        <Bar dataKey="Brand" stackId="a" fill={TYPE_COLORS.brand} radius={[0, 0, 0, 0]} />
        <Bar dataKey="Akvizice" stackId="a" fill={TYPE_COLORS.sales} />
        <Bar dataKey="Retargeting" stackId="a" fill={TYPE_COLORS.retargeting} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function CrossSummaryHero({ summary, eshopName, competitors }: { summary: string | null; eshopName: string; competitors: CompetitorResult[] }) {
  const sections = summary ? parseMarkdown(summary) : [];
  const names = competitors.map((c) => c.name).join(", ");

  return (
    <section className="bg-gradient-to-br from-[#4f11ff] to-[#7c3aed] rounded-3xl p-8 sm:p-10 text-white">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
          <Layers className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-1">Průnik napříč konkurencí</div>
          <h2 className="font-[family-name:var(--font-heading)] text-xl sm:text-2xl font-bold">
            Co dělá {names} stejně
          </h2>
          <p className="text-white/70 text-sm mt-1">
            Vzorce, které v tomto segmentu prokazatelně fungují — a mezery, kde může {eshopName} vyniknout.
          </p>
        </div>
      </div>

      {sections.length === 0 && (
        <p className="text-white/60 text-sm">Shrnutí se generuje…</p>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {sections.map((s, i) => (
          <div key={i} className="rounded-2xl bg-white/10 backdrop-blur-sm p-4 border border-white/10">
            {s.title && (
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#b0f221] mb-3">{s.title}</h3>
            )}
            <ul className="space-y-2">
              {s.body.split("\n").map((l) => l.trim()).filter(Boolean).map((line, j) => {
                const clean = line.replace(/^[-*•]\s*/, "");
                const parts = clean.split(/(\*\*[^*]+\*\*)/g);
                return (
                  <li key={j} className="flex gap-2 text-sm text-white/85 leading-relaxed">
                    <span className="mt-2 h-1 w-1 rounded-full bg-[#b0f221] shrink-0" />
                    <span>
                      {parts.map((p, k) =>
                        p.startsWith("**") && p.endsWith("**")
                          ? <strong key={k} className="text-white font-semibold">{p.slice(2, -2)}</strong>
                          : <span key={k}>{p}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
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
                <Globe className="h-3 w-3" />
                {competitor.website_url.replace(/^https?:\/\//, "")}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span className="flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" />{competitor.ads_count} reklam</span>
        </div>
      </div>

      <div className="p-6 sm:p-8 grid lg:grid-cols-[280px_1fr] gap-8">
        {/* Left: chart + per-type stats */}
        <div className="space-y-6">
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Reklamní mix</h3>
            <AdMixDonut mix={competitor.ad_mix} />
          </div>

          <div className="space-y-2">
            {(["brand", "sales", "retargeting"] as const).map((type) => {
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

        {/* Right: AI summary */}
        <div className="space-y-5">
          {competitor.status === "processing" && (
            <div className="flex items-center gap-3 text-sm text-gray-500 bg-gray-50 rounded-xl p-4">
              <RefreshCw className="h-4 w-4 animate-spin text-[#4f11ff]" />
              Generuji analýzu…
            </div>
          )}
          {competitor.status === "failed" && (
            <div className="text-sm text-red-500 bg-red-50 rounded-xl p-4">Analýza selhala.</div>
          )}
          {(competitor.status === "ready" || competitor.status === "empty") && sections.length === 0 && (
            <p className="text-sm text-gray-400">Žádná data k zobrazení.</p>
          )}
          {sections.map((s, i) => (
            <div key={i}>
              {s.title && (
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#4f11ff] mb-3">{s.title}</h3>
              )}
              <MarkdownBullets text={s.body} />
            </div>
          ))}
        </div>
      </div>

      {/* Ads grid */}
      {competitor.ads.length > 0 && (
        <div className="border-t border-gray-100 px-6 sm:px-8 py-6">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Ukázka reklam ({competitor.ads.length})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {competitor.ads.map((ad) => (
              <div key={ad.id} className="group relative rounded-xl overflow-hidden bg-gray-100 aspect-square border border-gray-200">
                {ad.video_url ? (
                  <video src={ad.video_url} poster={ad.image_url || undefined} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                ) : ad.image_url ? (
                  <img src={ad.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="h-6 w-6 text-gray-300" />
                  </div>
                )}

                {ad.video_url && (
                  <div className="absolute top-2 right-2">
                    <Video className="h-3.5 w-3.5 text-white drop-shadow" />
                  </div>
                )}

                <AdSourceBadge source={ad.ad_source} />

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-all flex flex-col justify-end p-2 opacity-0 group-hover:opacity-100">
                  <AdTypePill type={ad.ad_type} />
                  {ad.primary_text && (
                    <p className="text-white text-[10px] mt-1 line-clamp-3 leading-tight">{ad.primary_text}</p>
                  )}
                </div>

                {ad.is_active && (
                  <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#b0f221] shadow" title="Aktivní" />
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-3 text-xs text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#b0f221]" />Aktivní reklama</span>
            <span className="flex items-center gap-1"><span className="text-[10px] font-bold bg-[#1877F2] text-white px-1 rounded">Meta</span>Meta Ads</span>
            <span className="flex items-center gap-1"><span className="text-[10px] font-bold bg-blue-500 text-white px-1 rounded">Google</span>Google Ads</span>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ResultsPage() {
  const { sessionId } = useParams<{ sessionId: string }>();

  const { data, isLoading, isError } = useQuery<AnalysisResults>({
    queryKey: ["lm-results", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-lm-results", {
        body: { session_id: sessionId },
      });
      if (error) throw error;
      return data as AnalysisResults;
    },
    enabled: !!sessionId,
    retry: 1,
    // Poll every 6s while analysis is still running
    refetchInterval: (query) =>
      query.state.data?.status === "processing" ? 6000 : false,
    placeholderData: MOCK,
  });

  const results = data ?? MOCK;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-[family-name:var(--font-body)]">

      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <img src={performindLogo} alt="Performind Studio" className="h-6 object-contain" />
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4f11ff] bg-[#4f11ff]/8 px-3 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-[#b0f221]" />
            Analýza dokončena
          </span>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">

        {/* Page title */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 bg-[#b0f221]/20 text-gray-700 text-xs font-semibold px-4 py-1.5 rounded-full tracking-wide uppercase">
            Konkurenční analýza
          </div>
          <h1 className="font-[family-name:var(--font-heading)] text-3xl sm:text-4xl font-bold text-gray-900">
            Vaše konkurence<br className="sm:hidden" /> pod lupou
          </h1>
          <p className="text-gray-500 text-sm max-w-md mx-auto">
            Nascrapovali jsme {results.competitors.reduce((s, c) => s + c.ads_count, 0)} reklam od {results.competitors.length} konkurentů a nechali je analyzovat seniorním marketingovým stratégem.
          </p>
        </div>

        {isLoading && !data && (
          <div className="flex items-center justify-center gap-3 py-16 text-gray-400">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span>Načítám výsledky…</span>
          </div>
        )}

        {isError && !data && (
          <div className="text-center py-16 text-gray-400 text-sm">Nepodařilo se načíst výsledky. Zkuste obnovit stránku.</div>
        )}

        {data?.status === "processing" && (
          <div className="flex items-center gap-3 rounded-2xl border border-[#4f11ff]/20 bg-[#4f11ff]/5 px-5 py-4 text-sm text-[#4f11ff]">
            <RefreshCw className="h-4 w-4 animate-spin flex-shrink-0" />
            <span>Analýza stále probíhá — výsledky se automaticky aktualizují.</span>
          </div>
        )}

        {/* Hero: cross-synthesis */}
        <CrossSummaryHero
          summary={results.cross_summary}
          eshopName={results.eshop_name}
          competitors={results.competitors}
        />

        {/* Overall comparison chart */}
        {results.competitors.length >= 2 && (
          <section className="bg-white rounded-3xl border border-gray-100 p-6 sm:p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl bg-[#4f11ff]/8 border border-[#4f11ff]/15 flex items-center justify-center">
                <TrendingUp className="h-4.5 w-4.5 text-[#4f11ff]" />
              </div>
              <div>
                <h2 className="font-[family-name:var(--font-heading)] font-bold text-gray-900">Reklamní mix: akvizice vs. brand</h2>
                <p className="text-xs text-gray-400 mt-0.5">Kdo sází na okamžitý výkon a kdo buduje značku</p>
              </div>
            </div>

            <ComparisonChart competitors={results.competitors} />

            <div className="flex flex-wrap gap-4 mt-4 justify-center text-xs text-gray-500">
              {(["brand", "sales", "retargeting"] as const).map((t) => (
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
        <section className="rounded-3xl bg-gray-900 text-white p-8 sm:p-10 text-center space-y-4">
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
            <a
              href="https://performind.cz"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-[#b0f221] text-black font-semibold px-6 py-3.5 rounded-xl hover:bg-[#9de01a] transition-colors text-sm"
            >
              Chci strategii pro svůj e-shop
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="mailto:hello@performind.cz"
              className="inline-flex items-center justify-center gap-2 bg-white/10 text-white font-semibold px-6 py-3.5 rounded-xl hover:bg-white/20 transition-colors text-sm"
            >
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
