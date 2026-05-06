import { useRef } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight, Eye, Zap, Target, TrendingUp, Star, Clock, Check,
  Gift, Globe, Database, Cpu, Shield, BarChart3, Layers,
} from "lucide-react";
import performindLogo from "@/assets/performind-logo-dark.svg";
import { supabase } from "@/integrations/supabase/client";

/* ─── Data ─────────────────────────────────────────────────────────────────── */

const USP_CHIPS = [
  { icon: Gift,  label: "První analýza zdarma",  className: "bg-[#4f11ff]/8 text-[#4f11ff] border border-[#4f11ff]/20" },
  { icon: Globe, label: "Nejen pro e-shopy",      className: "bg-gray-50 text-gray-700 border border-gray-200" },
  { icon: Clock, label: "Výsledky za 5 minut",    className: "bg-[#b0f221]/15 text-gray-800 border border-[#b0f221]/40" },
];

const BENEFITS = [
  {
    icon: Eye,
    title: "Uvidíte, co konkurence skutečně investuje",
    body: "Nejdéle běžící reklamy jsou ty nejziskovější. Zjistíte, jaké kreativy, texty a sdělení konkurence udržuje měsíce v Google i na Metě – a proč.",
  },
  {
    icon: Target,
    title: "Najdete jejich slepá místa",
    body: "AI identifikuje témata a příležitosti, které konkurence v reklamách ignoruje. Přesně tam se vyplatí zaútočit.",
  },
  {
    icon: Zap,
    title: "Konkrétní doporučení, ne data",
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
    title: "Zadejte svůj email",
    body: "Zdarma odemknete přístup k nástroji. Zašleme vám ověřovací odkaz.",
  },
  {
    num: "02",
    title: "Vložte URL eshopu a 2 konkurentů",
    body: "Přidáte odkaz na Ad Library svůj a obou konkurentů. Trvá to 2 minuty.",
  },
  {
    num: "03",
    title: "Výsledky uvidíte přímo v prohlížeči",
    body: "Naše AI proskenuuje reklamy v Google i na Metě, porovná je a zobrazí výsledky okamžitě. Analýzu si pak zašlete na email jako PDF.",
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
    title: "Data z obou platforem",
    body: "Napojujeme se na Meta Ad Library a Google Ads Transparency Center. Vidíme každou aktivní reklamu, její délku běhu i formát.",
  },
  {
    icon: Cpu,
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
  { icon: Cpu,       label: "AI analýza",  sub: "Jazykové modely" },
  { icon: BarChart3, label: "Benchmarking", sub: "Data z klientů" },
  { icon: Zap,       label: "Výsledky",    sub: "Do 5 minut" },
];

/* ─── Email form ────────────────────────────────────────────────────────────── */

function EmailForm({ size = "lg" }: { size?: "lg" | "sm" }) {
  const [email, setEmail]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Zadejte platný email.");
      return;
    }
    setError("");
    setLoading(true);
    const { error: fnErr } = await supabase.functions.invoke("send-verification-email", {
      body: { email: trimmed },
    });
    setLoading(false);
    if (fnErr) {
      setError("Nepodařilo se odeslat email. Zkuste to prosím znovu.");
      return;
    }
    navigate(`/check-email?email=${encodeURIComponent(trimmed)}`);
  };

  const isLg = size === "lg";

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className={`flex flex-col sm:flex-row gap-3 mx-auto ${isLg ? "max-w-md" : "max-w-sm"}`}>
        <div className="flex-1">
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            placeholder="vas@email.cz"
            className={`w-full border border-gray-200 rounded-xl bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4f11ff]/40 focus:border-[#4f11ff] transition-all ${isLg ? "px-4 py-3.5 text-base" : "px-4 py-3 text-sm"}`}
          />
          {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
        </div>
        <button
          type="submit"
          disabled={loading}
          className={`flex items-center justify-center gap-2 bg-[#4f11ff] hover:bg-[#3d0dcc] text-white font-semibold rounded-xl transition-all whitespace-nowrap disabled:opacity-60 shadow-lg shadow-[#4f11ff]/20 ${isLg ? "px-6 py-3.5 text-base" : "px-5 py-3 text-sm"}`}
        >
          {loading ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
          ) : (
            <>Odemknout zdarma <ArrowRight className="h-4 w-4" /></>
          )}
        </button>
      </div>
      <p className="mt-2.5 text-xs text-gray-400 text-center">Bez platební karty. Bez spamu. 1× na e-mailovou adresu.</p>
    </form>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────────── */

export default function LandingPage() {
  const ctaRef  = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const scrollToCta = () => ctaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <div className="min-h-screen bg-white text-gray-900 font-[family-name:var(--font-body)]">

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <img src={performindLogo} alt="Performind Studio" className="h-6 object-contain" />
          <button
            onClick={scrollToCta}
            className="hidden sm:flex items-center gap-2 bg-[#4f11ff] hover:bg-[#3d0dcc] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-all shadow-md shadow-[#4f11ff]/20"
          >
            Získat analýzu zdarma <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="pt-14 pb-0 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">

          {/* USP chips */}
          <div className="flex flex-wrap justify-center gap-3 mb-8">
            {USP_CHIPS.map(({ icon: Icon, label, className }) => (
              <div key={label} className={`inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-full ${className}`}>
                <Icon className="h-4 w-4 flex-shrink-0" />
                {label}
              </div>
            ))}
          </div>

          <h1 className="font-[family-name:var(--font-heading)] text-4xl sm:text-5xl lg:text-[3.5rem] font-bold leading-[1.1] tracking-tight mb-5 text-gray-900">
            Víte, co vaše konkurence
            <br />
            <span className="text-[#4f11ff]">investuje do reklam</span>{" "}
            v Google a na Metě?
          </h1>

          <p className="text-gray-500 text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            Náš AI nástroj proskenuuje jejich reklamy, porovná je s vašimi
            a připraví konkrétní doporučení, kde máte prostor je předběhnout.
            <strong className="text-gray-800"> Zdarma, za 5 minut.</strong>
          </p>

          {/* CTA form — centered */}
          <div ref={ctaRef} className="flex justify-center mb-12">
            <EmailForm size="lg" />
          </div>
        </div>

        {/* ── Video — full width, autoplay, muted ── */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-0">
          <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-gray-200 border border-gray-100 bg-gray-900 aspect-video">
            <video
              ref={videoRef}
              autoPlay
              muted
              loop
              playsInline
              poster=""
              className="w-full h-full object-cover"
            >
              {/* <source src="/video/daniel-pitch.mp4" type="video/mp4" /> */}
            </video>

            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 gap-4">
              <div className="w-16 h-16 rounded-full bg-[#4f11ff] flex items-center justify-center shadow-lg shadow-[#4f11ff]/40">
                <svg className="h-6 w-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-white font-semibold text-lg font-[family-name:var(--font-heading)]">Daniel Sojak, Performind Studio</p>
                <p className="text-white/50 text-sm mt-1">Proč jsme tento nástroj vytvořili</p>
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#b0f221]" />
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
            <p className="text-[#4f11ff] text-sm font-semibold tracking-wide uppercase mb-3">Co z toho získáte</p>
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
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <section className="py-20 sm:py-28 bg-gray-50 border-y border-gray-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-[#4f11ff] text-sm font-semibold tracking-wide uppercase mb-3">Jak to funguje</p>
            <h2 className="font-[family-name:var(--font-heading)] text-3xl sm:text-4xl font-bold text-gray-900">
              Od emailu k výsledkům za 5 minut
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
            Analýza probíhá na pozadí — výsledky přijdou emailem do 5 minut
          </div>
        </div>
      </section>

      {/* ── What you'll get ────────────────────────────────────────────────── */}
      <section className="py-20 sm:py-28 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-[#4f11ff] text-sm font-semibold tracking-wide uppercase mb-3">Co dostanete</p>
            <h2 className="font-[family-name:var(--font-heading)] text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
              Kompletní přehled o reklamní strategii konkurence
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto">
              Analýza, kterou jinak dostanete jen jako placený onboarding u reklamní agentury.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-5">
            {[
              { icon: "🎯", title: "Aktivní reklamy konkurence", desc: "Vidíte všechny jejich spuštěné reklamy v Google i na Metě — kreativy, texty, CTA." },
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
            <p className="text-[#b0f221] text-sm font-semibold tracking-wide uppercase mb-3">Metodologie</p>
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
            <Check className="h-3 w-3" /> Zdarma · Bez závazků
          </div>
          <h2 className="font-[family-name:var(--font-heading)] text-3xl sm:text-4xl font-bold text-white mb-4">
            Chcete vědět, co dělá vaše konkurence?
          </h2>
          <p className="text-white/70 mb-10 text-lg">
            Zadejte email. Odemknete nástroj, který jinak používáme
            jen pro naše klienty.
          </p>

          <div className="bg-white rounded-2xl p-6 sm:p-8 text-left shadow-2xl shadow-[#3d0dcc]/30">
            <p className="font-[family-name:var(--font-heading)] font-bold text-gray-900 mb-1">Váš pracovní email</p>
            <p className="text-gray-500 text-sm mb-5">Zašleme vám ověřovací odkaz a po potvrzení odemknete analýzu.</p>
            <EmailForm size="sm" />
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-white/50 text-sm">
            {["Bez platební karty", "1× na email", "Výsledky do 5 minut"].map((t) => (
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
          <img src={performindLogo} alt="Performind Studio" className="h-5 object-contain" />
          <p className="text-gray-400 text-xs text-center">
            © {new Date().getFullYear()} Performind Studio s.r.o. · Strategický výkonnostní marketing
          </p>
          <a href="https://performind.cz" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-700 text-xs transition-colors">
            performind.cz
          </a>
        </div>
      </footer>
    </div>
  );
}
