import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Search, BarChart2, FileText, Sparkles, AlertTriangle } from "lucide-react";
import performindLogo from "@/assets/performind-logo-dark.svg";
import { supabase } from "@/integrations/supabase/client";

// ─── Pipeline ─────────────────────────────────────────────────────────────────

const PIPELINE_STEPS = [
  { icon: Search,    label: "Scrapujeme Meta Ads Library" },
  { icon: BarChart2, label: "Porovnáváme reklamy s konkurencí" },
  { icon: FileText,  label: "Generujeme analýzu a doporučení" },
  { icon: Sparkles,  label: "Připravujeme přehled výsledků" },
];

const STATUS_TO_STEP: Record<string, number> = {
  processing: 0,
  scraping: 0,
  scraped: 1,
  analyzing: 2,
  ready: 3,
};

// scraping: competitor-driven 10→45%, analyzing: time-driven 45→85%
const PHASE_RANGE: Record<string, [number, number]> = {
  processing: [8, 10],
  scraping:   [10, 45],
  analyzing:  [45, 85],
  ready:      [100, 100],
};
const ANALYZING_DURATION_MS = 4 * 60 * 1000;

// ─── Blurred results preview ──────────────────────────────────────────────────

function BlurredPreview() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden>
      {/* blur + dim overlay */}
      <div
        className="absolute inset-0 scale-[1.04]"
        style={{ filter: "blur(14px)", opacity: 0.45 }}
      >
        {/* page background */}
        <div className="min-h-screen bg-gray-50 px-4 py-10 space-y-6 max-w-4xl mx-auto">

          {/* header */}
          <div className="text-center space-y-2 mb-4">
            <div className="inline-block bg-[#b0f221]/20 text-gray-700 text-xs font-semibold px-4 py-1.5 rounded-full">Konkurenční analýza</div>
            <div className="h-9 w-80 bg-gray-300 rounded-xl mx-auto" />
            <div className="h-4 w-56 bg-gray-200 rounded-lg mx-auto" />
          </div>

          {/* Cross-analysis hero */}
          <div className="rounded-3xl bg-gradient-to-br from-[#4f11ff] to-[#7c3aed] p-8 text-white">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-11 h-11 rounded-xl bg-white/15 flex-shrink-0" />
              <div className="space-y-2">
                <div className="h-3 w-32 bg-white/30 rounded" />
                <div className="h-6 w-72 bg-white/60 rounded-lg" />
                <div className="h-3 w-56 bg-white/25 rounded" />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={`rounded-2xl bg-white/10 border border-white/10 p-5 space-y-2 ${i === 2 ? "sm:col-span-2" : ""}`}>
                  <div className="h-3 w-28 bg-white/40 rounded" />
                  {[0, 1, 2].map((j) => (
                    <div key={j} className="space-y-1">
                      <div className="h-3.5 bg-white/50 rounded" style={{ width: `${65 + j * 10}%` }} />
                      <div className="h-2.5 bg-white/25 rounded" style={{ width: `${80 - j * 8}%` }} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Positioning + quick wins */}
          <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl bg-[#4f11ff]/10" />
              <div className="space-y-1.5">
                <div className="h-4 w-52 bg-gray-300 rounded" />
                <div className="h-3 w-72 bg-gray-200 rounded" />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-8">
              {/* radar placeholder */}
              <div className="space-y-4">
                <div className="w-full aspect-square max-w-[220px] mx-auto rounded-full border-8 border-[#4f11ff]/10 flex items-center justify-center">
                  <div className="w-3/4 h-3/4 rounded-full border-4 border-[#4f11ff]/20 flex items-center justify-center">
                    <div className="w-1/2 h-1/2 rounded-full bg-[#4f11ff]/15" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-[#4f11ff]/5 rounded-xl p-3 space-y-1.5">
                    <div className="h-3 w-20 bg-[#4f11ff]/30 rounded" />
                    {[0,1].map(i => <div key={i} className="h-2.5 bg-gray-200 rounded" style={{ width: `${70 + i*10}%` }} />)}
                  </div>
                  <div className="bg-red-50 rounded-xl p-3 space-y-1.5">
                    <div className="h-3 w-20 bg-red-200 rounded" />
                    {[0,1].map(i => <div key={i} className="h-2.5 bg-gray-200 rounded" style={{ width: `${70 + i*10}%` }} />)}
                  </div>
                </div>
              </div>
              {/* quick wins */}
              <div className="space-y-3">
                <div className="h-4 w-24 bg-gray-200 rounded mb-4" />
                {[0, 1, 2].map((i) => (
                  <div key={i} className="border border-gray-100 rounded-xl p-4 space-y-1.5">
                    <div className="flex justify-between gap-3">
                      <div className="h-3.5 bg-gray-300 rounded" style={{ width: `${60 + i * 5}%` }} />
                      <div className="h-5 w-16 rounded-full flex-shrink-0"
                        style={{ background: i === 0 ? "#b0f221" : i === 1 ? "#fef3c7" : "#ede9fe" }} />
                    </div>
                    <div className="h-2.5 bg-gray-200 rounded w-5/6" />
                    <div className="h-2.5 bg-gray-200 rounded w-2/3" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Competitor 1 */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-8 py-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#4f11ff]/10" />
                <div className="space-y-1">
                  <div className="h-4 w-32 bg-gray-300 rounded" />
                  <div className="h-3 w-24 bg-gray-200 rounded" />
                </div>
              </div>
              <div className="h-3 w-16 bg-gray-200 rounded" />
            </div>
            <div className="p-8 space-y-6">
              <div className="grid sm:grid-cols-3 gap-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-4 space-y-2">
                    <div className="h-3 w-20 bg-gray-300 rounded" />
                    <div className="h-6 w-16 bg-[#4f11ff]/20 rounded" />
                    {[0, 1, 2].map((j) => (
                      <div key={j} className="h-2.5 bg-gray-200 rounded" style={{ width: `${75 - j * 10}%` }} />
                    ))}
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-100 pt-6">
                <div className="h-3 w-36 bg-gray-200 rounded mb-4" />
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="aspect-square rounded-xl overflow-hidden">
                      <div className="w-full h-full"
                        style={{ background: `hsl(${220 + i * 15}, 15%, ${88 - i * 3}%)` }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Competitor 2 */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-8 py-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#4f11ff]/10" />
                <div className="space-y-1">
                  <div className="h-4 w-40 bg-gray-300 rounded" />
                  <div className="h-3 w-28 bg-gray-200 rounded" />
                </div>
              </div>
              <div className="h-3 w-16 bg-gray-200 rounded" />
            </div>
            <div className="p-8 space-y-6">
              <div className="grid sm:grid-cols-3 gap-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-4 space-y-2">
                    <div className="h-3 w-20 bg-gray-300 rounded" />
                    <div className="h-6 w-12 bg-[#4f11ff]/20 rounded" />
                    {[0, 1, 2].map((j) => (
                      <div key={j} className="h-2.5 bg-gray-200 rounded" style={{ width: `${80 - j * 12}%` }} />
                    ))}
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-100 pt-6">
                <div className="h-3 w-36 bg-gray-200 rounded mb-4" />
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="aspect-square rounded-xl overflow-hidden">
                      <div className="w-full h-full"
                        style={{ background: `hsl(${260 + i * 12}, 20%, ${85 - i * 4}%)` }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* gradient vignette so edges fade out cleanly */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/60 via-white/20 to-white/60" />
      <div className="absolute inset-0 bg-gradient-to-r from-white/50 via-transparent to-white/50" />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WaitingPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [pipelineStatus, setPipelineStatus] = useState<string>("processing");
  const [scrapedCount, setScrapedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [progress, setProgress] = useState(8);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const analyzingStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let stopped = false;

    const poll = async () => {
      try {
        const { data } = await supabase.functions.invoke("poll-lm-pipeline", {
          body: { session_id: sessionId },
        });
        if (stopped) return;
        const status: string = data?.status ?? "processing";
        setPipelineStatus(status);
        setCurrentStep(STATUS_TO_STEP[status] ?? 0);
        if (data?.scraped != null) setScrapedCount(data.scraped);
        if (data?.total != null) setTotalCount(data.total);
        if (data?.error_message) setErrorMessage(data.error_message);
        if (status === "analyzing" && analyzingStartRef.current === null) {
          analyzingStartRef.current = Date.now();
        }
        if (status === "ready") navigate(`/results/${sessionId}`);
      } catch (e) {
        console.error("poll error:", e);
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => { stopped = true; clearInterval(interval); };
  }, [sessionId, navigate]);

  // Smooth progress animation — runs every 500 ms
  useEffect(() => {
    const tick = () => {
      if (pipelineStatus === "ready") { setProgress(100); return; }
      const [rangeMin, rangeMax] = PHASE_RANGE[pipelineStatus] ?? [2, 5];
      let target: number;
      if (pipelineStatus === "scraping" && totalCount > 0) {
        target = rangeMin + (scrapedCount / totalCount) * (rangeMax - rangeMin);
      } else if (pipelineStatus === "analyzing") {
        const elapsed = analyzingStartRef.current ? Date.now() - analyzingStartRef.current : 0;
        target = rangeMin + Math.min(0.95, elapsed / ANALYZING_DURATION_MS) * (rangeMax - rangeMin);
      } else {
        target = rangeMin;
      }
      setProgress(prev => Math.max(prev, target));
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [pipelineStatus, scrapedCount, totalCount]);

  return (
    <div className="relative min-h-screen bg-white text-gray-900 font-[family-name:var(--font-body)] flex flex-col overflow-hidden">

      {/* Blurred preview in background */}
      <BlurredPreview />

      {/* Frosted overlay covering the whole page */}
      <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px]" />

      {/* Actual UI */}
      <div className="relative z-10 flex flex-col min-h-screen">

        <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
            <img src={performindLogo} alt="Performind Marketing" className="h-5 object-contain" />
            <span className="hidden sm:flex items-center gap-1.5 bg-[#4f11ff]/8 text-[#4f11ff] text-xs font-semibold px-2.5 py-1 rounded-full border border-[#4f11ff]/15 tracking-wide uppercase">
              Analýza konkurence
            </span>
          </div>
        </nav>

        <div className="flex-1 flex items-center justify-center px-4 py-16">
          <div className="w-full max-w-lg text-center">

            {/* Pulsing icon */}
            <div className="relative inline-flex mb-10">
              <div className="w-24 h-24 rounded-full bg-[#4f11ff]/8 border border-[#4f11ff]/15 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-[#4f11ff]/10 border border-[#4f11ff]/20 flex items-center justify-center">
                  <Search className="h-7 w-7 text-[#4f11ff]" />
                </div>
              </div>
              <span className="absolute inset-0 rounded-full border border-[#4f11ff]/20 animate-ping" />
            </div>

            <h1 className="font-[family-name:var(--font-heading)] text-2xl sm:text-3xl font-bold mb-3 text-gray-900">
              Analýza probíhá
            </h1>
            <p className="text-gray-500 mb-6 text-sm">
              Trvá to přibližně do 5 minut. Výsledky se zobrazí<br className="hidden sm:block" /> přímo zde, jakmile budou hotové.
            </p>

            {/* Progress bar */}
            <div className="mb-8">
              <div className="flex justify-between items-baseline mb-2">
                <span className="text-sm font-semibold text-[#4f11ff]">{Math.round(progress)} %</span>
                {pipelineStatus === "scraping" && totalCount > 0 && (
                  <span className="text-xs text-gray-400">{scrapedCount} z {totalCount} konkurentů hotovo</span>
                )}
              </div>
              <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#4f11ff] rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Pipeline steps card */}
            <div className="bg-white/90 border border-gray-100 rounded-2xl p-6 text-left space-y-4 shadow-sm backdrop-blur-sm">
              {PIPELINE_STEPS.map((step, i) => {
                const StepIcon = step.icon;
                const isActive = i === currentStep;
                const isDone = i < currentStep;
                return (
                  <div key={i} className="flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-500 border ${
                      isDone
                        ? "bg-[#b0f221]/15 border-[#b0f221]/30"
                        : isActive
                        ? "bg-[#4f11ff]/8 border-[#4f11ff]/20"
                        : "bg-gray-50 border-gray-100"
                    }`}>
                      {isDone ? (
                        <Sparkles className="h-4 w-4 text-[#4f11ff]" />
                      ) : (
                        <StepIcon className={`h-4 w-4 transition-colors duration-500 ${isActive ? "text-[#4f11ff]" : "text-gray-300"}`} />
                      )}
                    </div>
                    <span className={`text-sm transition-colors duration-500 ${
                      isDone ? "text-gray-700" : isActive ? "text-gray-900 font-medium" : "text-gray-300"
                    }`}>
                      {step.label}
                      {isActive && pipelineStatus !== "failed" && (
                        <span className="ml-2 inline-flex gap-1">
                          <span className="w-1 h-1 rounded-full bg-[#4f11ff] animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-1 h-1 rounded-full bg-[#4f11ff] animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-1 h-1 rounded-full bg-[#4f11ff] animate-bounce" style={{ animationDelay: "300ms" }} />
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>

            {pipelineStatus === "failed" && (
              <div className="mt-6 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex gap-3 items-start text-left">
                <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                {errorMessage === "apify_credit_exhausted" ? (
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Technické problémy</p>
                    <p className="text-sm text-amber-700 mt-0.5">
                      Analýzu se momentálně nepodařilo spustit kvůli technickému výpadku na naší straně.
                      Pracujeme na nápravě — zkuste to prosím za chvíli.
                    </p>
                  </div>
                ) : errorMessage === "no_ads_scraped" ? (
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Nepodařilo se načíst reklamy</p>
                    <p className="text-sm text-amber-700 mt-0.5">
                      Z Meta Ads Library se nepodařilo získat žádná reklamní data. Zkontrolujte, zda jsou URL adresy Meta Ad Library správně zadané, a zkuste analýzu spustit znovu.
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Analýza selhala</p>
                    <p className="text-sm text-amber-700 mt-0.5">Zkuste to prosím znovu.</p>
                  </div>
                )}
              </div>
            )}

            <p className="text-gray-400 text-xs mt-6">
              Tuto stránku nemusíte hlídat — přesměrujeme vás automaticky.
            </p>
          </div>
        </div>

        <footer className="border-t border-gray-100 py-6 px-6 text-center bg-white/70">
          <p className="text-gray-400 text-xs">© {new Date().getFullYear()} Performind Marketing s.r.o.</p>
        </footer>
      </div>
    </div>
  );
}
