import { useNavigate } from "react-router-dom";
import { ArrowRight, MessageSquare, Layers, Activity } from "lucide-react";

// Styles mirror ResultsPage.tsx exactly so the teaser stays visually in sync

const ESHOP_COLOR  = "#6B46C1";
const COMP1_COLOR  = "#3B82F6";
const COMP2_COLOR  = "#F97316";

const QUICK_WINS = [
  { text: "Otestovat video formát — vaše konkurence ho používá 3× častěji",  difficulty: "jednoduche" },
  { text: "Přidat social proof do headline textu reklamní kopie",             difficulty: "stredni"    },
  { text: "Postavit retargetingovou sekvenci pro opuštěné košíky",           difficulty: "komplexni"  },
  { text: "Sjednotit vizuální styl reklam — brand není konzistentní",        difficulty: "stredni"    },
];

const DIFFICULTY: Record<string, { label: string; cls: string }> = {
  jednoduche: { label: "Jednoduché",  cls: "bg-[#b0f221]/20 text-gray-800 border-[#b0f221]/40" },
  stredni:    { label: "Střední",     cls: "bg-amber-50 text-amber-800 border-amber-200"        },
  komplexni:  { label: "Komplexní",   cls: "bg-[#4f11ff]/8 text-[#4f11ff] border-[#4f11ff]/20" },
};

// Placeholder ad tiles — colored gradient squares simulating creative thumbnails
const AD_TILES = [
  { bg: "from-violet-500 to-purple-700",  label: "Video",  active: true  },
  { bg: "from-blue-400 to-blue-600",      label: "Obr.",   active: true  },
  { bg: "from-orange-400 to-orange-600",  label: "Video",  active: false },
  { bg: "from-violet-400 to-indigo-600",  label: "Obr.",   active: true  },
  { bg: "from-sky-400 to-blue-500",       label: "Karusel",active: false },
  { bg: "from-purple-500 to-pink-600",    label: "Obr.",   active: true  },
];

export function ResultPreviewTeaser() {
  const navigate = useNavigate();

  return (
    <div className="relative overflow-hidden rounded-3xl border border-gray-100 shadow-sm bg-gray-50/60 max-w-4xl mx-auto">
      <div className="p-4 sm:p-6 space-y-4" style={{ paddingBottom: "9rem" }}>

        {/* ── 1. Wow-number row ─────────────────────────────────────────────── */}
        <div className="rounded-3xl bg-white border border-gray-100 shadow-sm p-5 sm:p-7 flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Objem reklam</p>
            <p className="font-[family-name:var(--font-heading)] text-4xl sm:text-5xl font-bold text-[#4f11ff] leading-none mb-2">3,2×</p>
            <p className="text-sm text-gray-600 leading-relaxed">více reklam spouští vaše konkurence oproti vám. Víte proč?</p>
          </div>
          <div className="hidden sm:block h-14 w-px bg-gray-100 shrink-0" />
          <div className="flex gap-6 sm:gap-8">
            <div className="text-center">
              <p className="font-[family-name:var(--font-heading)] text-2xl font-bold" style={{ color: ESHOP_COLOR }}>12</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">Vy</p>
            </div>
            <div className="text-center">
              <p className="font-[family-name:var(--font-heading)] text-2xl font-bold" style={{ color: COMP1_COLOR }}>31</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">Konk. 1</p>
            </div>
            <div className="text-center">
              <p className="font-[family-name:var(--font-heading)] text-2xl font-bold" style={{ color: COMP2_COLOR }}>26</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">Konk. 2</p>
            </div>
          </div>
        </div>

        {/* ── 2. Player card — Váš e-shop ───────────────────────────────────── */}
        <section className="rounded-3xl border border-gray-100 bg-white overflow-hidden shadow-sm">
          {/* Header */}
          <div
            className="px-5 sm:px-7 py-4 flex items-center gap-4"
            style={{ borderBottom: `2px solid ${ESHOP_COLOR}30` }}
          >
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-base shrink-0 font-[family-name:var(--font-heading)]"
              style={{ background: ESHOP_COLOR }}
            >
              Vy
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-[family-name:var(--font-heading)] font-bold text-gray-900 text-base leading-tight">Váš e-shop</p>
              <p className="text-xs text-gray-400 mt-0.5">vaseshop.cz · placeholder analýza</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-[family-name:var(--font-heading)] text-2xl font-bold leading-none" style={{ color: ESHOP_COLOR }}>12</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">reklam</p>
            </div>
          </div>

          {/* 3 blocks */}
          <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Strategie */}
            <div className="bg-gray-50 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5 shrink-0" style={{ color: ESHOP_COLOR }} />
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Strategie</span>
              </div>
              <div className="space-y-1.5 text-xs text-gray-500">
                <div className="flex justify-between gap-2">
                  <span>Hlavní sdělení</span>
                  <span className="font-medium text-gray-700 text-right">Cena a kvalita</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Cílová skupina</span>
                  <span className="font-medium text-gray-700">30–45 let</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Tón komunikace</span>
                  <span className="font-medium text-gray-700">Informativní</span>
                </div>
              </div>
            </div>

            {/* Kreativa */}
            <div className="bg-gray-50 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 shrink-0" style={{ color: ESHOP_COLOR }} />
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Kreativa</span>
              </div>
              <div className="space-y-1.5 text-xs text-gray-500">
                <div className="flex justify-between gap-2">
                  <span>Single image</span>
                  <span className="font-medium text-gray-700">87 %</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Video</span>
                  <span className="font-medium text-gray-700">0 %</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Karusel</span>
                  <span className="font-medium text-gray-700">13 %</span>
                </div>
              </div>
            </div>

            {/* Aktivita */}
            <div className="bg-gray-50 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 shrink-0" style={{ color: ESHOP_COLOR }} />
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Aktivita</span>
              </div>
              <div className="space-y-1.5 text-xs text-gray-500">
                <div className="flex justify-between gap-2">
                  <span>Aktivní reklamy</span>
                  <span className="font-bold text-base leading-none font-[family-name:var(--font-heading)]" style={{ color: ESHOP_COLOR }}>12</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Nejdelší reklama</span>
                  <span className="font-medium text-gray-700">47 dní</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Frekvence změn</span>
                  <span className="font-medium text-gray-700">Nízká</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── 3. Quick wins ─────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Quick wins pro vás</p>
          {QUICK_WINS.map((qw, i) => {
            const d = DIFFICULTY[qw.difficulty];
            return (
              <div key={i} className="border border-gray-100 rounded-xl p-4 bg-white flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-gray-900 leading-snug">{qw.text}</p>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${d.cls}`}>{d.label}</span>
              </div>
            );
          })}
        </div>

        {/* ── 4. Ad gallery hint ────────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Galerie reklam</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {AD_TILES.map((t, i) => (
              <div key={i} className="relative rounded-xl overflow-hidden aspect-square border border-gray-200">
                <div className={`w-full h-full bg-gradient-to-br ${t.bg} opacity-80`} />
                <span className="absolute bottom-1.5 left-1.5 text-white font-medium text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.55)" }}>
                  {t.label}
                </span>
                {t.active && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#b0f221] shadow-sm" />
                )}
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ── Fade overlay ──────────────────────────────────────────────────────── */}
      <div className="absolute bottom-0 inset-x-0 h-[48%] pointer-events-none"
        style={{ background: "linear-gradient(to top, #ffffff 45%, rgba(255,255,255,0.85) 70%, transparent)" }}
      />

      {/* ── CTA overlay ───────────────────────────────────────────────────────── */}
      <div className="absolute bottom-6 inset-x-0 flex flex-col items-center gap-2 px-4 z-10">
        <button
          onClick={() => navigate("/analyze")}
          className="inline-flex items-center gap-2 bg-[#b0f221] hover:bg-[#a3e01e] text-gray-900 font-semibold px-7 py-3.5 rounded-xl transition-all shadow-lg shadow-[#b0f221]/35 text-sm"
        >
          Spustit analýzu <ArrowRight className="h-4 w-4" />
        </button>
        <p className="text-xs text-gray-400 text-center max-w-xs">
          Ukázka výstupu. Vaše analýza poběží na reálných datech vaší konkurence.
        </p>
      </div>
    </div>
  );
}
