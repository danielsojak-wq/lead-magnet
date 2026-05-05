import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Search, BarChart2, FileText, CheckCircle2, Sparkles } from "lucide-react";
import performindLogo from "@/assets/performind-logo-dark.svg";
import { supabase } from "@/integrations/supabase/client";

const STEPS = [
  { icon: Search,    label: "Scrapujeme Google Ads data",         duration: 3000 },
  { icon: Search,    label: "Scrapujeme Meta Ads Library",         duration: 3000 },
  { icon: BarChart2, label: "Porovnáváme reklamy s konkurencí",    duration: 2500 },
  { icon: FileText,  label: "Generujeme analýzu a doporučení",     duration: 2500 },
  { icon: Sparkles,  label: "Připravujeme přehled výsledků",       duration: 1500 },
];

export default function WaitingPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [animationDone, setAnimationDone] = useState(false);

  // Advance through animation steps
  useEffect(() => {
    let step = 0;
    const advance = () => {
      if (step >= STEPS.length - 1) {
        setCurrentStep(STEPS.length - 1);
        setTimeout(() => setAnimationDone(true), STEPS[step].duration);
        return;
      }
      const delay = STEPS[step].duration;
      setTimeout(() => {
        step += 1;
        setCurrentStep(step);
        advance();
      }, delay);
    };
    advance();
  }, []);

  // Poll every 5s — navigate as soon as backend reports ready
  useEffect(() => {
    if (!sessionId) return;
    const poll = async () => {
      const { data } = await supabase.functions.invoke("get-lm-results", {
        body: { session_id: sessionId },
      });
      if (data?.status === "ready") {
        navigate(`/results/${sessionId}`);
      }
    };
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [sessionId, navigate]);

  // Navigate when animation finishes — handles the mocked/dev flow too
  useEffect(() => {
    if (animationDone && sessionId) {
      navigate(`/results/${sessionId}`);
    }
  }, [animationDone, sessionId, navigate]);

  return (
    <div className="min-h-screen bg-white text-gray-900 font-[family-name:var(--font-body)] flex flex-col">

      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center">
          <img src={performindLogo} alt="Performind Studio" className="h-6 object-contain" />
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg text-center">

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
          <p className="text-gray-500 mb-10 text-sm">
            Trvá to přibližně 5–10 minut. Výsledky se zobrazí<br className="hidden sm:block" /> přímo zde, jakmile budou hotové.
          </p>

          <div className="bg-white border border-gray-100 rounded-2xl p-6 text-left space-y-4 shadow-sm">
            {STEPS.map((step, i) => {
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
                      <CheckCircle2 className="h-4 w-4 text-[#4f11ff]" />
                    ) : (
                      <StepIcon className={`h-4 w-4 transition-colors duration-500 ${isActive ? "text-[#4f11ff]" : "text-gray-300"}`} />
                    )}
                  </div>
                  <span className={`text-sm transition-colors duration-500 ${
                    isDone ? "text-gray-700" : isActive ? "text-gray-900 font-medium" : "text-gray-300"
                  }`}>
                    {step.label}
                    {isActive && (
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

          <p className="text-gray-400 text-xs mt-6">
            Tuto stránku nemusíte hlídat — přesměrujeme vás automaticky.
          </p>
        </div>
      </div>

      <footer className="border-t border-gray-100 py-6 px-6 text-center bg-white">
        <p className="text-gray-400 text-xs">
          © {new Date().getFullYear()} Performind Studio s.r.o.
        </p>
      </footer>
    </div>
  );
}
