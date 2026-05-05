import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Mail, Search, BarChart2, FileText, CheckCircle2 } from "lucide-react";
import performindLogo from "@/assets/performind-logo-dark.svg";

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
    <div className="min-h-screen bg-white text-gray-900 font-[family-name:var(--font-body)] flex flex-col">

      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center">
          <img src={performindLogo} alt="Performind Studio" className="h-6 object-contain" />
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg text-center">

          {!done ? (
            <>
              {/* Animated radar icon */}
              <div className="relative inline-flex mb-10">
                <div className="w-24 h-24 rounded-full bg-[#4f11ff]/8 border border-[#4f11ff]/15 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-[#4f11ff]/10 border border-[#4f11ff]/20 flex items-center justify-center">
                    <Search className="h-7 w-7 text-[#4f11ff]" />
                  </div>
                </div>
                <span className="absolute inset-0 rounded-full border border-[#4f11ff]/20 animate-ping" />
              </div>

              <h1 className="font-[family-name:var(--font-heading)] text-2xl sm:text-3xl font-bold mb-3 text-gray-900">
                Analyza probiha
              </h1>
              <p className="text-gray-500 mb-10 text-sm">
                Trvá to priblizne 5-10 minut. Nemusíte cekat -<br className="hidden sm:block" /> vysledky zasleseme na vas email.
              </p>

              {/* Step list */}
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
                Tuto stranku muzete zavrit. Email dorazi do 10 minut.
              </p>
            </>
          ) : (
            /* Done state */
            <div className="bg-white border border-gray-100 rounded-3xl p-12 shadow-sm">
              <div className="relative inline-flex mb-8">
                <div className="w-20 h-20 rounded-2xl bg-[#4f11ff]/8 border border-[#4f11ff]/15 flex items-center justify-center">
                  <Mail className="h-9 w-9 text-[#4f11ff]" />
                </div>
                <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-[#b0f221] flex items-center justify-center">
                  <CheckCircle2 className="h-3.5 w-3.5 text-black" />
                </div>
              </div>

              <h1 className="font-[family-name:var(--font-heading)] text-2xl sm:text-3xl font-bold mb-3 text-gray-900">
                Analyza odeslana!
              </h1>
              <p className="text-gray-500 text-sm leading-relaxed">
                Vysledky jsme odeslali na vas email.<br />
                Zkontrolujte take slozku spam.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-6 px-6 text-center bg-white">
        <p className="text-gray-400 text-xs">
          © {new Date().getFullYear()} Performind Studio s.r.o.
        </p>
      </footer>
    </div>
  );
}
