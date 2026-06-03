import { useSearchParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Mail, RefreshCw, CheckCircle2, ArrowRight, Sparkles } from "lucide-react";
import performindLogo from "@/assets/performind-logo-dark.svg";
import { supabase } from "@/integrations/supabase/client";

const STEPS = [
  { label: "Formulář vyplněn", done: true },
  { label: "Ověření emailu", done: false, active: true },
  { label: "Spuštění analýzy", done: false },
  { label: "Výsledky", done: false },
];

export default function CheckEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const email = params.get("email") || "";
  const sessionId = params.get("session") || "";

  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    let stopped = false;

    const poll = async () => {
      const { data } = await supabase
        .from("lm_sessions")
        .select("status")
        .eq("id", sessionId)
        .single();

      if (stopped) return;
      const status = data?.status ?? "";
      if (["urls_pending", "processing", "ready", "failed"].includes(status)) {
        setVerified(true);
        setTimeout(() => navigate(`/waiting/${sessionId}`), 1800);
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => { stopped = true; clearInterval(interval); };
  }, [sessionId, navigate]);

  const handleResend = async () => {
    setResending(true);
    await supabase.functions.invoke("send-verification-email", { body: { email } });
    setResending(false);
    setResent(true);
    setTimeout(() => setResent(false), 4000);
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 font-[family-name:var(--font-body)] flex flex-col">

      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <img src={performindLogo} alt="Performind Marketing" className="h-6 object-contain" />
          <span className="hidden sm:flex items-center gap-1.5 bg-[#4f11ff]/8 text-[#4f11ff] text-xs font-semibold px-2.5 py-1 rounded-full border border-[#4f11ff]/15 tracking-wide uppercase">
            Analýza konkurence
          </span>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg space-y-6">

          {/* Step indicator */}
          <div className="flex items-center justify-center">
            {STEPS.map((step, i) => (
              <div key={step.label} className="flex items-center">
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500 ${
                    step.done
                      ? "bg-[#b0f221] text-gray-900"
                      : (step as { active?: boolean }).active
                      ? "bg-[#4f11ff] text-white ring-4 ring-[#4f11ff]/15"
                      : "bg-gray-100 text-gray-400"
                  }`}>
                    {step.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <span className={`text-[10px] whitespace-nowrap ${
                    (step as { active?: boolean }).active ? "text-gray-600" : step.done ? "text-gray-400" : "text-gray-300"
                  }`}>
                    {step.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-12 sm:w-16 h-px mx-1.5 mb-5 transition-colors duration-500 ${
                    step.done ? "bg-[#b0f221]/50" : "bg-gray-200"
                  }`} />
                )}
              </div>
            ))}
          </div>

          {/* Main card */}
          <div className="bg-white border border-gray-100 rounded-3xl p-8 sm:p-10 text-center shadow-sm">

            {!verified ? (
              <>
                {/* Icon */}
                <div className="relative inline-flex mb-8">
                  <div className="w-20 h-20 rounded-2xl bg-[#4f11ff]/8 border border-[#4f11ff]/15 flex items-center justify-center">
                    <Mail className="h-9 w-9 text-[#4f11ff]" />
                  </div>
                  <span className="absolute inset-0 rounded-2xl border border-[#4f11ff]/30 animate-ping" />
                  <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-[#b0f221] flex items-center justify-center shadow-sm">
                    <span className="text-[10px] font-bold text-gray-900">✓</span>
                  </div>
                </div>

                <h1 className="font-[family-name:var(--font-heading)] text-2xl sm:text-3xl font-bold mb-3 text-gray-900">
                  Zkontrolujte email
                </h1>
                <p className="text-gray-400 text-sm mb-1">Poslali jsme odkaz na</p>
                <p className="text-gray-900 font-semibold text-base mb-8 break-all">{email}</p>

                {/* CTA box */}
                <div className="bg-[#4f11ff]/5 border border-[#4f11ff]/15 rounded-2xl px-6 py-4 mb-8">
                  <p className="text-gray-900 font-semibold text-sm leading-relaxed">
                    Klikněte na odkaz v emailu<br />
                    <span className="text-[#4f11ff]">→ analýza se spustí okamžitě</span>
                  </p>
                </div>

                {/* Resend */}
                <div className="border-t border-gray-100 pt-6">
                  <p className="text-gray-400 text-xs mb-3">Email nedorazil?</p>
                  {resent ? (
                    <div className="flex items-center justify-center gap-2 text-[#4f11ff] text-xs font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Znovu odesláno!
                    </div>
                  ) : (
                    <button
                      onClick={handleResend}
                      disabled={resending}
                      className="inline-flex items-center gap-2 text-gray-400 hover:text-gray-600 text-xs transition-colors disabled:opacity-40"
                    >
                      {resending
                        ? <RefreshCw className="h-3 w-3 animate-spin" />
                        : <ArrowRight className="h-3 w-3" />}
                      {resending ? "Odesílám…" : "Poslat znovu"}
                    </button>
                  )}
                </div>
              </>
            ) : (
              /* Verified state */
              <>
                <div className="relative inline-flex mb-8">
                  <div className="w-20 h-20 rounded-2xl bg-[#b0f221]/20 border border-[#b0f221]/40 flex items-center justify-center">
                    <Sparkles className="h-9 w-9 text-gray-800" />
                  </div>
                </div>
                <h1 className="font-[family-name:var(--font-heading)] text-2xl sm:text-3xl font-bold mb-3 text-gray-900">
                  Email ověřen!
                </h1>
                <p className="text-gray-500 mb-8 text-sm leading-relaxed">
                  Spouštíme analýzu vaší konkurence…
                </p>
                <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-[#b0f221] h-1.5 rounded-full animate-[progress_1.8s_linear_forwards]" />
                </div>
              </>
            )}
          </div>

          {/* Info strip */}
          {!verified && (
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-gray-400 text-xs">
              {["Email dorazí do 1 minuty", "Zkontrolujte spam", "Odkaz platný 24 hodin"].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-gray-300" /> {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <footer className="border-t border-gray-100 py-6 px-6 text-center bg-white">
        <p className="text-gray-400 text-xs">© {new Date().getFullYear()} Performind Marketing s.r.o.</p>
      </footer>
    </div>
  );
}
