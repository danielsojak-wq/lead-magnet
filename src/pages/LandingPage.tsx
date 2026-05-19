import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight, Eye, Zap, Target, TrendingUp, Clock, Check,
  Gift, Globe, Database, Brain, Shield, BarChart3, Layers,
} from "lucide-react";
import performindLogo from "@/assets/performind-logo-dark.svg";

/* ─── Data ─────────────────────────────────────────────────────────────────── */

const USP_CHIPS = [
  { icon: Gift,  label: "První analýza zdarma",  className: "bg-[#4f11ff]/8 text-[#4f11ff] border border-[#4f11ff]/20" },
  { icon: Globe, label: "Nejen pro e-shopy",      className: "bg-gray-50 text-gray-700 border border-gray-200" },
  { icon: Clock, label: "Výsledky za 5 minut",    className: "bg-[#b0f221]/15 text-gray-800 border border-[#b0f221]/40" },
];

const BENEFITS = [
  {
    icon: Eye,
    title: "Konkrétní doporučení, která můžete aplikovat hned",
    body: "Jaké formáty, úhly komunikace, kreativy a využívají všichni ",
  },
  {
    icon: Target,
    title: "Najdete jejich slepá místa",
    body: "AI identifikuje témata a příležitosti, které konkurence v reklamách ignoruje. Přesně tam se vyplatí zaútočit.",
  },
  {
    icon: Zap,
    title: "Žádná teorie, ale konkrétní doporučení",
    body: "Nedostanete tabulky plné čísel. Dostanete jasný seznam: co zlepšit, co testovat a kde máte oproti konkurenci výhodu.",
  },
  {
    icon: TrendingUp,
    title: "Každodenní výhoda ve správě reklam",
    body: "Tuto analýzu provádíme každý den při správě kampaní pro naše klienty. Teď ji máte zdarma i vy – jednou.",
  },
];

const STEPS = [
  {
    num: "01",
    title: "Výsledky přímo v prohlížeči",
    body: "Proskenujeme  vaše Meta reklamy a reklamy konkurence, porovnáme je a vytvoříme analýzu s konkrétními doporučeními. Tu si poté můžete nechat poslat na mail nebo vyexporrtovat.",
  },
  {
    num: "02",
    title: "Ověřte svůj email",
    body: "Zašleme vám ověřovací odkaz. Po kliknutí se automaticky spustí analýza.",
  },
  {
    num: "03",
    title: "Výsledky uvidíte přímo v prohlížeči",
    body: "Naše AI proskenuuje reklamy na Metě, porovná je a zobrazí výsledky okamžitě. Analýzu si pak zašlete na email.",
  },
];

const STATS = [
  { value: "78 %", label: "levnější poptávky pro naše klienty" },
  { value: "30 %", label: "průměrný růst obratu za 6 měsíců" },
  { value: "15+",  label: "e-shopů v naší aktivní správě" },
  { value: "3 min", label: "a víte, co dělá konkurence" },
];

const AI_FEATURES = [
  {
    icon: Database,
    title: "Data přímo z platforem",
    body: "Napojujeme se na Meta Ads Library. Vidíme každou aktivní reklamu, její délku běhu i formát.",
  },
  {
    icon: Brain,
    title: "Pokročilé AI modely",
    body: "Analýzu zpracovávají jazykové modely nejnovější generace. Nespoléháme na pravidla — AI interpretuje kontext, sdělení a záměr za každou reklamou.",
  },
  {
    icon: BarChart3,
    title: "Benchmarky z praxe",
    body: "Výsledky porovnáváme s daty ze 15+ eshopů v naší aktivní správě. Víme, co je průměr a co je skutečná konkurenční výhoda.",
  },
  {
    icon: Layers,
    title: "Vícevrstvá analýza",
    body: "Hodnotíme copy, kreativy, délku nasazení, frekvenci změn i konzistenci sdělení. Každá vrstva vypovídá o strategii jinak.",
  },
  {
    icon: Target,
    title: "Identifikace příležitostí",
    body: "AI hledá témata a segmenty, které konkurence přehlíží. Tyto mezery jsou vaší největší příležitostí.",
  },
  {
    icon: Shield,
    title: "Ověřená metodika",
    body: "Každý výstup vychází z frameworku, který používáme při onboardingu klientů. Žádné dohady — jen praxí ověřené otázky.",
  },
];

const PIPELINE = [
  { icon: Globe,     label: "Sběr dat",    sub: "Ad Library API" },
  { icon: Brain,     label: "AI analýza",  sub: "Jazykové modely" },
  { icon: BarChart3, label: "Benchmarking", sub: "Data z klientů" },
  { icon: Zap,       label: "Výsledky",    sub: "Do 5 minut" },
];

/* ─── CTA button ────────────────────────────────────────────────────────────── */

function CtaButton({ size = "lg" }: { size?: "lg" | "sm" }) {
  const navigate = useNavigate();
  const isLg = size === "lg";

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={() => navigate("/analyze")}
        className={`inline-flex items-center justify-center gap-2 bg-[#b0f221] hover:bg-[#a3e01e] text-gray-900 font-semibold rounded-xl transition-all shadow-lg shadow-[#b0f221]/30 ${isLg ? "px-8 py-4 text-base" : "px-6 py-3.5 text-sm"}`}
      >
        Získat analýzu zdarma <ArrowRight className="h-4 w-4" />
      </button>
      <p className="text-xs text-gray-400">{"\n"}</p>
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────────── */

export default function LandingPage() {
  const ctaRef = useRef<HTMLDivElement>(null);

  const scrollToCta = () => ctaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <div className="min-h-screen bg-white text-gray-900 font-[family-name:var(--font-body)]">

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={performindLogo} alt="Performind Marketing" className="h-6 object-contain" />
            <span className="hidden sm:flex items-center gap-1.5 bg-[#4f11ff]/8 text-[#4f11ff] text-xs font-semibold px-2.5 py-1 rounded-full border border-[#4f11ff]/15 tracking-wide uppercase">
              Analýza konkurence
            </span>
          </div>
          <button
            onClick={scrollToCta}
            className="hidden sm:flex items-center gap-2 bg-[#b0f221] hover:bg-[#a3e01e] text-gray-900 text-sm font-semibold px-4 py-2 rounded-lg transition-all shadow-md shadow-[#b0f221]/30"
          >
            Získat analýzu zdarma <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative pt-16 pb-20 overflow-hidden bg-gray-950">
        {/* Background blobs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-[#4f11ff]/25 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-72 h-72 bg-[#b0f221]/12 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute top-20 left-10 w-48 h-48 bg-[#4f11ff]/15 rounded-full blur-[80px] pointer-events-none" />
        {/* Dot grid */}
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)", backgroundSize: "28px 28px" }} />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-white/6 border border-white/10 rounded-full px-4 py-2 text-sm text-white/60 mb-10">
            <span className="w-2 h-2 rounded-full bg-[#b0f221] animate-pulse shrink-0" />
            Získejte konkrétní doporučení do 10 minut
          </div>

          <h1 className="font-[family-name:var(--font-heading)] text-4xl sm:text-5xl lg:text-[3.25rem] font-bold leading-[1.12] tracking-tight mb-6 text-white whitespace-pre-line">
            Víte, jak vaše konkurence dělá reklamu na Metě?{"\n\n"}
            Za komplexní analýzu si agentury účtují 10 000 Kč a více.{"\n\n"}
            <span className="text-[#b0f221]">Teď ji získáte zdarma.</span>
          </h1>

          <p className="text-white/50 text-lg max-w-xl mx-auto mb-10 leading-relaxed whitespace-pre-line">
            Proskenujeme aktivní reklamy vaší konkurence, zhodnotíme strategii{"\n"}
            a najdeme potenciál.
          </p>

          {/* CTA */}
          <div ref={ctaRef} className="flex justify-center mb-14">
            <CtaButton size="lg" />
          </div>

          {/* Feature cards strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto">
            {[
              { icon: Database, label: "Pokročilá analýza", sub: "Dodáme ihned aplikovatelná doporučení" },
              { icon: Brain,    label: "Vlastní AI model",         sub: "Trénovaný na marketingových datech" },
              { icon: BarChart3, label: "Konkrétní quick wins",       sub: "Přímo použitelná doporučení" },
            ].map(({ icon: Icon, label, sub }) => (
              <div key={label} className="flex items-center gap-3 bg-white/5 border border-white/8 rounded-2xl px-4 py-3 text-left">
                <div className="w-9 h-9 rounded-xl bg-[#b0f221]/15 border border-[#b0f221]/20 flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-[#b0f221]" />
                </div>
                <div>
                  <p className="text-white text-xs font-semibold leading-snug">{label}</p>
                  <p className="text-white/40 text-[11px] mt-0.5">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats bar ──────────────────────────────────────────────────────── */}
      <section className="py-12 border-y border-gray-100 bg-gray-50 mt-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 grid grid-cols-2 sm:grid-cols-4 gap-8">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="font-[family-name:var(--font-heading)] text-3xl font-bold text-[#4f11ff]">{s.value}</div>
              <div className="text-gray-500 text-sm mt-1 leading-snug">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Why it matters ─────────────────────────────────────────────────── */}
      <section className="py-20 sm:py-28 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-[#4f11ff] text-sm font-semibold tracking-wide uppercase mb-3">CO ZÍSKÁTE</p>
            <h2 className="font-[family-name:var(--font-heading)] text-3xl sm:text-4xl font-bold text-gray-900">
              Informace, které vám konkurence nikdy nedá 👀
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
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <section className="py-20 sm:py-28 bg-gray-50 border-y border-gray-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-[#4f11ff] text-sm font-semibold tracking-wide uppercase mb-3">JAK TO FUNGUJE</p>
            <h2 className="font-[family-name:var(--font-heading)] text-3xl sm:text-4xl font-bold text-gray-900">
              Od URL k výsledkům za 5-10 minut ⚡️
            </h2>
          </div>

          <div className="space-y-6">
            {STEPS.map((step, i) => (
              <div key={step.num} className="flex gap-6 items-start bg-white rounded-2xl border border-gray-100 p-6">
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

          <div className="mt-10 flex items-center justify-center gap-2 text-gray-400 text-sm">
            <Clock className="h-4 w-4" />
            Analýza probíhá na pozadí — výsledky se zobrazí přímo v prohlížeči
          </div>
        </div>
      </section>

      {/* ── What you'll get ────────────────────────────────────────────────── */}
      <section className="py-20 sm:py-28 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-[#4f11ff] text-sm font-semibold tracking-wide uppercase mb-3">Co dostanete</p>
            <h2 className="font-[family-name:var(--font-heading)] text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
              Přehled marketingové strategie konkurence zdarma 🔥
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto whitespace-pre-line">
              Za podobné analýzy si agentury běžně účtují 10 000 Kč a více{"\n\n"}
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-5">
            {[
              { icon: "🎯", title: "Aktivní reklamy konkurence", desc: "Vidíte všechny jejich spuštěné reklamy na Metě — kreativy, texty, CTA." },
              { icon: "🧠", title: "AI shrnutí strategie", desc: "Co komunikují, komu cílí, jaké formáty udržují nejdéle. V čem jsou dobří a kde slábnou." },
              { icon: "🚀", title: "Konkrétní doporučení", desc: "Co udělat jinak, kde zaútočit, co testovat jako první. Žádná teorie — jen akce." },
            ].map((item) => (
              <div key={item.title} className="border border-gray-100 rounded-2xl p-6 bg-white hover:shadow-md transition-all">
                <div className="text-3xl mb-4">{item.icon}</div>
                <h3 className="font-[family-name:var(--font-heading)] font-bold mb-2 text-gray-900">{item.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI Methodology ─────────────────────────────────────────────────── */}
      <section className="py-20 sm:py-28 bg-[#0c0a1e]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">

          <div className="text-center mb-14">
            <p className="text-[#b0f221] text-sm font-semibold tracking-wide uppercase mb-3">JAK TO DĚLÁME</p>
            <h2 className="font-[family-name:var(--font-heading)] text-3xl sm:text-4xl font-bold text-white mb-5">
              Víc než scraping reklam.
              <br />
              <span className="text-[#b0f221]">Inteligentní analýza s daty z praxe.</span>
            </h2>
            <p className="text-white/55 max-w-2xl mx-auto text-lg leading-relaxed">
              Za každou analýzou stojí AI modely trénované na reálných kampaních,
              benchmarky z eshopů v naší správě a strukturovaná data
              z obou největších reklamních platforem.
            </p>
          </div>

          {/* Feature grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
            {AI_FEATURES.map((f) => (
              <div key={f.title} className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/8 hover:border-white/20 transition-all">
                <div className="w-10 h-10 rounded-xl bg-[#4f11ff]/40 flex items-center justify-center mb-4">
                  <f.icon className="h-5 w-5 text-[#b0f221]" />
                </div>
                <h3 className="font-[family-name:var(--font-heading)] font-bold text-white mb-2">{f.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>

          {/* Pipeline */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8">
            <p className="text-white/35 text-xs font-semibold tracking-widest uppercase mb-6">Jak analýza probíhá</p>
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

      {/* ── Final CTA ──────────────────────────────────────────────────────── */}
      <section className="py-20 sm:py-28 bg-[#4f11ff]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 text-white text-xs font-semibold px-4 py-1.5 rounded-full mb-6">
            <Check className="h-3 w-3" /> ZDARMA
          </div>
          <h2 className="font-[family-name:var(--font-heading)] text-3xl sm:text-4xl font-bold text-white mb-4">
            Chcete vědět, co dělá vaše konkurence? 👀
          </h2>
          <p className="text-white/70 mb-10 text-lg">
            {"\n"}
          </p>

          <div ref={ctaRef} className="flex justify-center">
            <CtaButton size="sm" />
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-white/50 text-sm">
            {["\n", "1× na email", "Pouze 1x pro každou e-mail adresu"].map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-[#b0f221]" /> {t}
              </span>
            ))}
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
