import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight, Eye, Zap, Target, TrendingUp, Check, X,
  Globe, Database, Brain, BarChart3,
} from "lucide-react";
import performindLogo from "@/assets/performind-logo-dark.svg";
import { AuthorBio } from "@/components/landing/AuthorBio";
import { ClientLogosMarquee } from "@/components/landing/ClientLogosMarquee";
import { FloatingIcons } from "@/components/landing/FloatingIcons";
import { ProblemSection } from "@/components/landing/ProblemSection";

/* ─── Data ─────────────────────────────────────────────────────────────────── */


const BENEFITS = [
  {
    icon: Eye,
    title: "Aktivní reklamy konkurence",
    body: "Uvidíte každou jejich spuštěnou reklamu na Metě - kreativy, copy, formáty, délku běhu. Žádný odhad, jen real-time data přímo z knihovny reklam.",
  },
  {
    icon: Target,
    title: "Quick wins s prioritou",
    body: "Získáte konkrétní akční seznam - co aplikovat nejdříve, co později, kde máte oproti konkurenci výhodu. Každý bod ke zlepšení má označenou obtížnost nasazení.",
  },
  {
    icon: Zap,
    title: "Žádná teorie, jen akce",
    body: "Nedostanete tabulky plné čísel. Dostanete jasný seznam: co zlepšit, co testovat a kde je mezera, kterou konkurence přehlíží.",
  },
  {
    icon: TrendingUp,
    title: "Náš každodenní framework",
    body: "Stejnou analýzu provádíme téměř každý den při správě kampaní pro naše klienty. Nyní ji zdarma získáte i vy.",
  },
];

const STEPS = [
  {
    num: "01",
    title: "Zadáte vaši URL adresu + 2 konkurenty",
    body: "Vyplníte krátký formulář - váš web a 2 hlavní konkurenty. Systém najde jejich Facebook stránky automaticky.",
  },
  {
    num: "02",
    title: "Sken konkurence a analýza",
    body: "Systém proskenuje reklamy konkurence a na základě našich frameworků je porovná s vašimi.",
  },
  {
    num: "03",
    title: "Výsledky do 5 minut",
    body: "Uvidíte reklamy konkurence, analýzu jejich strategie a slabá místa. Dostanete konkrétní doporučení přímo v prohlížeči.",
  },
];


const PIPELINE = [
  { icon: Globe,     label: "Sběr dat",    sub: "Aktuální reklamy z Meta Ads Library" },
  { icon: Brain,     label: "Paralelní AI analýza",  sub: "Vyhodnotíme každého konkurenta zvlášť" },
  { icon: BarChart3, label: "Syntéza dat", sub: "Porovnání všech hráčů, identifikace mezer" },
  { icon: Zap,       label: "Výsledky",    sub: "Konkrétní doporučení s prioritou" },
];

/* ─── CTA button ────────────────────────────────────────────────────────────── */

function CtaButton({
  size = "lg",
  label = "Spustit analýzu zdarma",
  subText,
}: {
  size?: "lg" | "sm";
  label?: string;
  subText?: string;
}) {
  const navigate = useNavigate();
  const isLg = size === "lg";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        {isLg && (
          <div aria-hidden className="cta-aurora pointer-events-none absolute -inset-4 rounded-3xl" />
        )}
        <button
          onClick={() => navigate("/analyze")}
          className={`relative overflow-hidden inline-flex items-center justify-center gap-2 bg-[#b0f221] hover:bg-[#a3e01e] text-gray-900 font-semibold rounded-xl transition-all shadow-lg shadow-[#b0f221]/30 ${isLg ? "cta-shimmer px-8 py-4 text-base" : "px-6 py-3.5 text-sm"}`}
        >
          {label} <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      {subText && <p className="text-xs text-gray-400">{subText}</p>}
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────────── */

export default function LandingPage() {
  const ctaRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white text-gray-900 font-[family-name:var(--font-body)]">

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={performindLogo} alt="Performind Marketing" className="h-5 object-contain" />
            <span className="hidden sm:flex items-center gap-1.5 bg-[#4f11ff]/8 text-[#4f11ff] text-xs font-semibold px-2.5 py-1 rounded-full border border-[#4f11ff]/15 tracking-wide uppercase">
              Analýza konkurence
            </span>
          </div>
          <button
            onClick={() => navigate("/analyze")}
            className="hidden sm:flex items-center gap-2 bg-[#b0f221] hover:bg-[#a3e01e] text-gray-900 text-sm font-semibold px-4 py-2 rounded-lg transition-all shadow-md shadow-[#b0f221]/30"
          >
            Získat analýzu zdarma <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative pt-16 pb-10 overflow-hidden bg-gray-950">
        {/* Floating decorative icons — ambient background, z-index 0 */}
        <FloatingIcons />
        {/* Background blobs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-[#4f11ff]/25 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-72 h-72 bg-[#b0f221]/12 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute top-20 left-10 w-48 h-48 bg-[#4f11ff]/15 rounded-full blur-[80px] pointer-events-none" />
        {/* Dot grid */}
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)", backgroundSize: "28px 28px" }} />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 text-center">
          {/* ICP eyebrow */}
          <div className="inline-flex items-center gap-2 bg-white/6 border border-white/10 rounded-full px-4 py-2 text-sm text-white/60 mb-10">
            <span className="w-2 h-2 rounded-full bg-[#b0f221] animate-pulse shrink-0" />
            Pro CZ a SK e-shopy s obratem 5–50 M Kč
          </div>

          {/* Klikatelný hero text → /analyze (interní React Router navigace) */}
          <div
            role="link"
            tabIndex={0}
            onClick={() => navigate("/analyze")}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/analyze"); } }}
            className="group cursor-pointer"
          >
          <h1 className="font-[family-name:var(--font-heading)] text-4xl sm:text-5xl lg:text-[3.25rem] font-bold leading-[1.12] tracking-tight mb-10 text-white">
            Proč vás konkurence v reklamě 
            <br />
            na Metě předbíhá?
          </h1>

          <p className="font-[family-name:var(--font-heading)] text-2xl sm:text-3xl font-semibold text-white/70 group-hover:text-white/90 transition-colors mb-8 leading-snug">
            Odhalte jejich strategii za 5 minut
          </p>
          </div>

          <p className="text-white/50 text-lg max-w-xl mx-auto mb-10 leading-relaxed">
            Proskenujeme každou aktivní reklamu vašich 2 hlavních konkurentů, vyhodnotíme strategii a najdeme mezery, které můžete využít.
          </p>

          {/* CTA */}
          <div ref={ctaRef} className="flex justify-center mb-14">
            <CtaButton size="lg" label="Spustit analýzu" subText="1 analýza zdarma" />
          </div>

          {/* Feature pills strip */}
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 max-w-3xl mx-auto">
            {[
              { icon: Database,  label: "Hotovo do 5 minut" },
              { icon: Brain,     label: "AI analýza + naše metodika" },
              { icon: BarChart3, label: "Konkrétní kroky, ne teorie" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="group relative flex items-center gap-2 sm:gap-2.5 rounded-full pl-1.5 sm:pl-2 pr-3 sm:pr-4 py-1.5 sm:py-2 bg-white/[0.04] border border-white/10 hover:border-[#b0f221]/40 hover:bg-white/[0.07] transition-all duration-300 shrink-0"
              >
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-[#b0f221]/25 to-[#b0f221]/5 border border-[#b0f221]/25 flex items-center justify-center shrink-0 group-hover:from-[#b0f221]/40 transition-all">
                  <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#b0f221]" />
                </div>
                <span className="text-white/90 text-xs sm:text-sm font-medium whitespace-nowrap">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Demo video (produktový hook pod hero) ──────────────────────────── */}
      <section className="bg-gray-950 pt-4 pb-16 sm:pb-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <button
            onClick={() => navigate("/analyze")}
            aria-label="Spustit analýzu — ukázka hotové analýzy"
            className="group block w-full rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 hover:ring-[#b0f221]/40 transition-all cursor-pointer"
            style={{ aspectRatio: "16 / 9" }}
          >
            <video
              src="/demo-analyza.mp4"
              poster="/demo-analyza-poster.jpg"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              className="w-full h-full object-cover"
            />
          </button>
        </div>
      </section>

      {/* ── Problem (agitate) ──────────────────────────────────────────────── */}
      <ProblemSection />

      {/* ── Why it matters ─────────────────────────────────────────────────── */}
      <section className="py-20 sm:py-28 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-[#4f11ff] text-sm font-semibold tracking-wide uppercase mb-3">CO ZÍSKÁTE</p>
            <h2 className="font-[family-name:var(--font-heading)] text-3xl sm:text-4xl font-bold text-gray-900">
              Informace, které vám konkurence nikdy nedá
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {BENEFITS.map((b) => (
              <div key={b.title} className="border border-gray-100 rounded-2xl p-7 hover:border-[#4f11ff]/30 hover:shadow-md hover:shadow-[#4f11ff]/5 transition-all group bg-white">
                <div className="w-10 h-10 rounded-xl bg-[#b0f221]/20 flex items-center justify-center mb-4">
                  <b.icon className="h-5 w-5 text-[#4f11ff]" />
                </div>
                <h3 className="font-[family-name:var(--font-heading)] font-bold text-lg mb-2 text-gray-900">{b.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{b.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 flex justify-center">
            <CtaButton size="sm" label="Spustit analýzu zdarma" subText="1 analýza zdarma" />
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <section className="py-20 sm:py-28 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-[#4f11ff] text-sm font-semibold tracking-wide uppercase mb-3">JAK TO FUNGUJE</p>
            <h2 className="font-[family-name:var(--font-heading)] text-3xl sm:text-4xl font-bold text-gray-900">
              Od URL k výsledkům do 5 minut
            </h2>
          </div>

          <div className="space-y-6">
            {STEPS.map((step, i) => (
              <div key={step.num} className="flex gap-6 items-start bg-gray-50 rounded-2xl border border-gray-100 p-6">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-[family-name:var(--font-heading)] font-bold text-lg flex-shrink-0 ${i === 0 ? "bg-[#4f11ff] text-white shadow-md shadow-[#4f11ff]/30" : "bg-gray-100 text-gray-400"}`}>
                  {step.num}
                </div>
                <div className="pt-1">
                  <h3 className="font-[family-name:var(--font-heading)] font-bold text-lg mb-1 text-gray-900">{step.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{step.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex justify-center">
            <CtaButton size="sm" label="Získat analýzu zdarma" subText="1 analýza zdarma" />
          </div>
        </div>
      </section>

      {/* ── Author Bio ─────────────────────────────────────────────────────── */}
      <AuthorBio />

      {/* ── Social proof: pruh log klientů ─────────────────────────────────── */}
      <ClientLogosMarquee />

      {/* ── AI Methodology ─────────────────────────────────────────────────── */}
      <section className="py-20 sm:py-28 bg-[#0c0a1e]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">

          <div className="text-center mb-14">
            <p className="text-[#b0f221] text-sm font-semibold tracking-wide uppercase mb-3">TECHNICKÉ OKÉNKO</p>
            <h2 className="font-[family-name:var(--font-heading)] text-3xl sm:text-4xl font-bold text-white mb-5">
              Více než jen scraping reklam
            </h2>
          </div>

          {/* Pipeline */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8">
            <p className="text-white/35 text-xs font-semibold tracking-widest uppercase mb-6">JAK TO PROBÍHÁ</p>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 sm:gap-3">
              {PIPELINE.map((step, i) => (
                <div key={step.label} className="flex sm:flex-1 items-center gap-3 sm:gap-3">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-9 h-9 rounded-xl bg-[#4f11ff] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#4f11ff]/30">
                      <step.icon className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="text-white text-sm font-semibold leading-tight">{step.label}</p>
                      <p className="text-white/40 text-xs mt-0.5">{step.sub}</p>
                    </div>
                  </div>
                  {i < PIPELINE.length - 1 && (
                    <ArrowRight className="h-4 w-4 text-white/20 flex-shrink-0 hidden sm:block" />
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* ── Dis-qualifier ──────────────────────────────────────────────────── */}
      <section className="py-20 sm:py-28 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <p className="text-[#4f11ff] text-sm font-semibold tracking-wide uppercase mb-3">PRO KOHO JE TENTO NÁSTROJ</p>
            <h2 className="font-[family-name:var(--font-heading)] text-3xl sm:text-4xl font-bold text-gray-900">
              Tato analýza nemá smysl pro každého
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* For whom */}
            <div className="rounded-2xl border border-gray-100 p-7 bg-white">
              <h3 className="font-[family-name:var(--font-heading)] font-bold text-lg text-gray-900 mb-5">Pro koho ANO</h3>
              <ul className="space-y-3">
                {[
                  "CZ a SK e-shopy s obratem 5–50 M Kč/rok",
                  "Aktivní reklamní rozpočet 30 000 Kč+ měsíčně",
                  "Vlastní značka, vlastní produkty",
                  "Konkurence s aktivními reklamami na Metě",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <Check className="h-4 w-4 text-[#4f11ff] mt-0.5 shrink-0" />
                    <span className="text-gray-700 text-sm leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Not for whom */}
            <div className="rounded-2xl border border-gray-100 p-7 bg-gray-50">
              <h3 className="font-[family-name:var(--font-heading)] font-bold text-lg text-gray-900 mb-5">Pro koho NE</h3>
              <ul className="space-y-3">
                {[
                  "E-shopy pod 5 M Kč ročního obratu (málo dat)",
                  "Minimální reklamní rozpočet",
                  "Značky bez aktivních reklam na Metě",
                  "Konkurence bez aktivních reklam na Metě",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <X className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                    <span className="text-gray-400 text-sm leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────────── */}
      <section className="py-20 sm:py-28 bg-[#4f11ff]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 text-white text-xs font-semibold px-4 py-1.5 rounded-full mb-6">
            <Check className="h-3 w-3" /> ZDARMA, BEZ ZÁVAZKU
          </div>
          <h2 className="font-[family-name:var(--font-heading)] text-3xl sm:text-4xl font-bold text-white mb-8">
            Na co ještě čekáte?
          </h2>
          <p className="text-white/70 mb-10 text-lg">
            Zjistěte během 5 minut, co dělá vaše konkurence a získejte doporučení, co můžete udělat lépe.
          </p>

          <div ref={ctaRef} className="flex justify-center">
            <CtaButton size="sm" label="Spustit analýzu zdarma" />
          </div>

        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 py-8 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <img src={performindLogo} alt="Performind Marketing" className="h-5 object-contain" />
          <p className="text-gray-400 text-xs text-center">
            © {new Date().getFullYear()} Performind Marketing s.r.o. · Pomáháme firmám růst
          </p>
          <a href="https://performind.cz" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-700 text-xs transition-colors">
            performind.cz
          </a>
        </div>
      </footer>
    </div>
  );
}
