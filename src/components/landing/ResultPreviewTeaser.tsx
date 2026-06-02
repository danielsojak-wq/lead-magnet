import { useNavigate } from "react-router-dom";
import { ArrowRight, MessageSquare, Layers, Activity } from "lucide-react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip,
} from "recharts";

// ── Mock data ──────────────────────────────────────────────────────────────────
// Vy=14, K1=45 → 45/14 = 3.2×, K2=31  (math checks out)
const VY_COLOR   = "#6B46C1";
const K1_COLOR   = "#3B82F6";
const K2_COLOR   = "#F97316";

const RADAR_DATA = [
  { axis: "Objem",       vy: 38, k1: 92, k2: 78 },
  { axis: "Kreativa",    vy: 52, k1: 74, k2: 58 },
  { axis: "Funnel",      vy: 44, k1: 83, k2: 62 },
  { axis: "Akvizice",    vy: 35, k1: 88, k2: 72 },
  { axis: "Brand",       vy: 68, k1: 55, k2: 42 },
  { axis: "Remarketing", vy: 28, k1: 62, k2: 85 },
];

const QUICK_WINS = [
  { text: "Otestovat video formát — vaše konkurence ho používá 3× častěji",   difficulty: "jednoduche" },
  { text: "Přidat social proof do headline textu reklamní kopie",              difficulty: "stredni"    },
  { text: "Postavit retargetingovou sekvenci pro opuštěné košíky",            difficulty: "komplexni"  },
  { text: "Sjednotit vizuální styl reklam — brand není konzistentní",         difficulty: "stredni"    },
];

const DIFFICULTY: Record<string, { label: string; cls: string }> = {
  jednoduche: { label: "Jednoduché", cls: "bg-[#b0f221]/20 text-gray-800 border-[#b0f221]/40"     },
  stredni:    { label: "Střední",    cls: "bg-amber-50 text-amber-800 border-amber-200"            },
  komplexni:  { label: "Komplexní",  cls: "bg-[#4f11ff]/8 text-[#4f11ff] border-[#4f11ff]/20"    },
};

const AD_TILES = [
  { bg: "from-violet-500 to-purple-700", label: "Video",    active: true  },
  { bg: "from-blue-400 to-blue-600",     label: "Obr.",     active: true  },
  { bg: "from-orange-400 to-orange-600", label: "Video",    active: false },
  { bg: "from-violet-400 to-indigo-600", label: "Obr.",     active: true  },
  { bg: "from-sky-400 to-blue-500",      label: "Karusel",  active: false },
  { bg: "from-purple-500 to-pink-600",   label: "Obr.",     active: true  },
];

// ── Component ──────────────────────────────────────────────────────────────────
export function ResultPreviewTeaser() {
  const navigate = useNavigate();

  return (
    // Outer wrapper carries the animated lime-glow background
    <div className="relative max-w-4xl mx-auto px-1 py-6">

      {/* ── Animated lime glow blobs ──────────────────────────────────────── */}
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none -z-10">
        {/* Primary blob — center */}
        <div
          className="lime-glow absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] h-[80%] rounded-full"
          style={{
            background: "radial-gradient(ellipse, rgba(176,242,33,0.22) 0%, rgba(176,242,33,0.06) 55%, transparent 75%)",
            animation: "limeGlow 9s ease-in-out infinite",
            filter: "blur(2px)",
          }}
        />
        {/* Secondary blob — top-right */}
        <div
          className="lime-glow absolute -top-8 -right-8 w-72 h-72 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(176,242,33,0.18) 0%, transparent 65%)",
            animation: "limeGlow 12s ease-in-out 3s infinite reverse",
            filter: "blur(1px)",
          }}
        />
        {/* Tertiary blob — bottom-left */}
        <div
          className="lime-glow absolute -bottom-6 -left-6 w-56 h-56 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(79,17,255,0.10) 0%, transparent 65%)",
            animation: "limeGlow 15s ease-in-out 6s infinite",
            filter: "blur(1px)",
          }}
        />
      </div>

      {/* ── Teaser card ───────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-3xl shadow-2xl"
        style={{
          border: "1.5px solid rgba(176,242,33,0.30)",
          background: "rgba(255,255,255,0.97)",
          boxShadow: "0 8px 48px rgba(176,242,33,0.18), 0 2px 16px rgba(0,0,0,0.06)",
        }}
      >
        <div className="p-4 sm:p-6 space-y-4" style={{ paddingBottom: "9rem" }}>

          {/* 1. Wow-number row */}
          <div className="rounded-3xl bg-white border border-gray-100 shadow-sm p-5 sm:p-7 flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Objem reklam · K1 vs. Vy</p>
              <p className="font-[family-name:var(--font-heading)] text-4xl sm:text-5xl font-bold text-[#4f11ff] leading-none mb-2">3,2×</p>
              <p className="text-sm text-gray-600 leading-relaxed">více reklam spouští Konkurent 1 oproti vám. Víte proč?</p>
            </div>
            <div className="hidden sm:block h-14 w-px bg-gray-100 shrink-0" />
            <div className="flex gap-6 sm:gap-8">
              <div className="text-center">
                <p className="font-[family-name:var(--font-heading)] text-2xl font-bold" style={{ color: VY_COLOR }}>14</p>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">Vy</p>
              </div>
              <div className="text-center">
                <p className="font-[family-name:var(--font-heading)] text-2xl font-bold" style={{ color: K1_COLOR }}>45</p>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">Konk. 1</p>
              </div>
              <div className="text-center">
                <p className="font-[family-name:var(--font-heading)] text-2xl font-bold" style={{ color: K2_COLOR }}>31</p>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">Konk. 2</p>
              </div>
            </div>
          </div>

          {/* 2. Player card */}
          <section className="rounded-3xl border border-gray-100 bg-white overflow-hidden shadow-sm">
            <div className="px-5 sm:px-7 py-4 flex items-center gap-4" style={{ borderBottom: `2px solid ${VY_COLOR}30` }}>
              <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-base shrink-0 font-[family-name:var(--font-heading)]" style={{ background: VY_COLOR }}>
                Vy
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-[family-name:var(--font-heading)] font-bold text-gray-900 text-base leading-tight">Váš e-shop</p>
                <p className="text-xs text-gray-400 mt-0.5">vaseshop.cz · placeholder analýza</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-[family-name:var(--font-heading)] text-2xl font-bold leading-none" style={{ color: VY_COLOR }}>14</p>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">reklam</p>
              </div>
            </div>
            <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5 shrink-0" style={{ color: VY_COLOR }} />
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Strategie</span>
                </div>
                <div className="space-y-1.5 text-xs text-gray-500">
                  {[["Hlavní sdělení","Cena a kvalita"],["Cílová skupina","30–45 let"],["Tón komunikace","Informativní"]].map(([k,v]) => (
                    <div key={k} className="flex justify-between gap-2"><span>{k}</span><span className="font-medium text-gray-700">{v}</span></div>
                  ))}
                </div>
              </div>
              <div className="bg-gray-50 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 shrink-0" style={{ color: VY_COLOR }} />
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Kreativa</span>
                </div>
                <div className="space-y-1.5 text-xs text-gray-500">
                  {[["Single image","87 %"],["Video","0 %"],["Karusel","13 %"]].map(([k,v]) => (
                    <div key={k} className="flex justify-between gap-2"><span>{k}</span><span className="font-medium text-gray-700">{v}</span></div>
                  ))}
                </div>
              </div>
              <div className="bg-gray-50 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 shrink-0" style={{ color: VY_COLOR }} />
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Aktivita</span>
                </div>
                <div className="space-y-1.5 text-xs text-gray-500">
                  <div className="flex justify-between gap-2"><span>Aktivní reklamy</span><span className="font-bold text-base leading-none font-[family-name:var(--font-heading)]" style={{ color: VY_COLOR }}>14</span></div>
                  {[["Nejdelší reklama","47 dní"],["Frekvence změn","Nízká"]].map(([k,v]) => (
                    <div key={k} className="flex justify-between gap-2"><span>{k}</span><span className="font-medium text-gray-700">{v}</span></div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* 3. Radar chart */}
          <div className="rounded-3xl border border-gray-100 bg-white shadow-sm p-5 sm:p-6">
            <div className="flex items-center gap-4 mb-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Poziční mapa</p>
              <div className="flex items-center gap-3 ml-auto">
                {[["Vy", VY_COLOR],["Konk. 1", K1_COLOR],["Konk. 2", K2_COLOR]].map(([label, color]) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                    <span className="text-[11px] text-gray-500">{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={RADAR_DATA} cx="50%" cy="50%" outerRadius="72%">
                <PolarGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{ fontSize: 11, fill: "#9ca3af", fontWeight: 600 }}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  formatter={(v: number, name: string) => [`${v}`, name === "vy" ? "Vy" : name === "k1" ? "Konk. 1" : "Konk. 2"]}
                />
                <Radar name="vy" dataKey="vy" stroke={VY_COLOR} fill={VY_COLOR} fillOpacity={0.25} strokeWidth={2} />
                <Radar name="k1" dataKey="k1" stroke={K1_COLOR} fill={K1_COLOR} fillOpacity={0.20} strokeWidth={2} />
                <Radar name="k2" dataKey="k2" stroke={K2_COLOR} fill={K2_COLOR} fillOpacity={0.18} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* 4. Quick wins */}
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

          {/* 5. Ad gallery */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Galerie reklam</p>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {AD_TILES.map((t, i) => (
                <div key={i} className="relative rounded-xl overflow-hidden aspect-square border border-gray-200">
                  <div className={`w-full h-full bg-gradient-to-br ${t.bg} opacity-80`} />
                  <span className="absolute bottom-1.5 left-1.5 text-white font-medium text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.55)" }}>{t.label}</span>
                  {t.active && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#b0f221] shadow-sm" />}
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Fade overlay */}
        <div
          className="absolute bottom-0 inset-x-0 h-[42%] pointer-events-none"
          style={{ background: "linear-gradient(to top, rgba(255,255,255,1) 40%, rgba(255,255,255,0.92) 65%, transparent)" }}
        />

        {/* CTA overlay */}
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
    </div>
  );
}
