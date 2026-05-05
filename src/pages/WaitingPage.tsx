import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Mail, Search, BarChart2, FileText, CheckCircle2 } from "lucide-react";
import performindLogo from "@/assets/performind-logo.png";

const STEPS = [
  { icon: Search, label: "Scrapujeme Google Ads data", duration: 3000 },
  { icon: Search, label: "Scrapujeme Meta Ads Library", duration: 3000 },
  { icon: BarChart2, label: "Porovnavame reklamy s konkurenci", duration: 2500 },
  { icon: FileText, label: "Generujeme analyzu a doporuceni", duration: 2500 },
  { icon: Mail, label: "Posilame vysledky na vas email", duration: 1500 },
];

export default function WaitingPage() {
  useParams<{ sessionId: string }>();
  const [currentStep, setCurrentStep] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let step = 0;
    const advance = () => {
      if (step >= STEPS.length - 1) {
        setCurrentStep(STEPS.length - 1);
        setTimeout(() => setDone(true), STEPS[step].duration);
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

  return (
    <div className="min-h-screen bg-[#08080d] text-white font-[family-name:var(--font-body)] flex flex-col">

      {/* Navbar */}
      <nav className="border-b border-white/8 px-6 h-16 flex items-center">
        <img src={performindLogo} alt="Performind Studio" className="h-6 object-contain brightness-0 invert" />
      </nav>

      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-[#4f11ff]/12 rounded-full blur-[140px]" />
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="relative w-full max-w-lg text-center">

          {!done ? (
            <>
              {/* Animated radar icon */}
              <div className="relative inline-flex mb-10">
                <div className="w-24 h-24 rounded-full bg-[#4f11ff]/10 border border-[#4f11ff]/20 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-[#4f11ff]/15 border border-[#4f11ff]/25 flex items-center justify-center">
                    <Search className="h-7 w-7 text-[#4f11ff]" />
                  </div>
                </div>
                {/* Pulse rings */}
                <span className="absolute inset-0 rounded-full border border-[#4f11ff]/20 animate-ping" />
              </div>

              <h1 className="font-[family-name:var(--font-heading)] text-2xl sm:text-3xl font-bold mb-3">
                Analyza probiha
              </h1>
              <p className="text-white/50 mb-10 text-sm">
                Trvá to priblizne 5-10 minut. Nemusíte cekat -<br className="hidden sm:block" /> vysledky zasleseme na vas email.
              </p>

              {/* Step list */}
              <div className="bg-white/4 border border-white/10 rounded-2xl p-6 text-left space-y-4">
                {STEPS.map((step, i) => {
                  const StepIcon = step.icon;
                  const isActive = i === currentStep;
                  const isDone = i < currentStep;
                  return (
                    <div key={i} className="flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-500 ${
                        isDone
                          ? "bg-[#b0f221]/15 border border-[#b0f221]/30"
                          : isActive
                          ? "bg-[#4f11ff]/20 border border-[#4f11ff]/30"
                          : "bg-white/4 border border-white/10"
                      }`}>
                        {isDone ? (
                          <CheckCircle2 className="h-4 w-4 text-[#b0f221]" />
                        ) : (
                          <StepIcon className={`h-4 w-4 transition-colors duration-500 ${isActive ? "text-[#4f11ff]" : "text-white/20"}`} />
                        )}
                      </div>
                      <span className={`text-sm transition-colors duration-500 ${
                        isDone ? "text-[#b0f221]" : isActive ? "text-white" : "text-white/25"
                      }`}>
                        {step.label}
                        {isActive && (
                          <span className="ml-2 inline-flex gap-1">
                            <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>

              <p className="text-white/20 text-xs mt-6">
                Tuto stranku muzete zavrit. Email dorazí do 10 minut.
              </p>
            </>
          ) : (
            /* Done state */
            <div className="bg-white/4 border border-white/10 rounded-3xl p-12">
              <div className="relative inline-flex mb-8">
                <div className="w-20 h-20 rounded-2xl bg-[#b0f221]/10 border border-[#b0f221]/30 flex items-center justify-center">
                  <Mail className="h-9 w-9 text-[#b0f221]" />
                </div>
                <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-[#b0f221] flex items-center justify-center">
                  <CheckCircle2 className="h-3.5 w-3.5 text-black" />
                </div>
              </div>

              <h1 className="font-[family-name:var(--font-heading)] text-2xl sm:text-3xl font-bold mb-3">
                Analyza odeslana!
              </h1>
              <p className="text-white/50 text-sm leading-relaxed">
                Vysledky jsme odeslali na vas email.<br />
                Zkontrolujte take slozku spam.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/8 py-6 px-6 text-center">
        <p className="text-white/20 text-xs">
          © {new Date().getFullYear()} Performind Studio s.r.o.
        </p>
      </footer>
    </div>
  );
}
