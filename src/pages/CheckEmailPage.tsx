import { useSearchParams } from "react-router-dom";
import { useState } from "react";
import { Mail, ArrowRight, RefreshCw, CheckCircle2, Clock } from "lucide-react";
import performindLogo from "@/assets/performind-logo.png";

export default function CheckEmailPage() {
  const [params] = useSearchParams();
  const email = params.get("email") || "tvůj email";
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);

  const handleResend = async () => {
    setResending(true);
    await new Promise((r) => setTimeout(r, 1200)); // placeholder
    setResending(false);
    setResent(true);
  };

  return (
    <div className="min-h-screen bg-[#08080d] text-white font-[family-name:var(--font-body)] flex flex-col">

      {/* Navbar */}
      <nav className="border-b border-white/8 px-6 h-16 flex items-center">
        <img src={performindLogo} alt="Performind Studio" className="h-6 object-contain brightness-0 invert" />
      </nav>

      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-[#4f11ff]/15 rounded-full blur-[120px]" />
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="relative w-full max-w-lg">

          {/* Card */}
          <div className="bg-white/4 border border-white/10 rounded-3xl p-8 sm:p-12 text-center">

            {/* Icon */}
            <div className="relative inline-flex mb-8">
              <div className="w-20 h-20 rounded-2xl bg-[#4f11ff]/20 border border-[#4f11ff]/30 flex items-center justify-center">
                <Mail className="h-9 w-9 text-[#b0f221]" />
              </div>
              <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-[#b0f221] flex items-center justify-center">
                <CheckCircle2 className="h-3.5 w-3.5 text-black" />
              </div>
            </div>

            <h1 className="font-[family-name:var(--font-heading)] text-2xl sm:text-3xl font-bold mb-3">
              Zkontroluj svůj email
            </h1>

            <p className="text-white/50 mb-2">
              Poslali jsme ověřovací odkaz na
            </p>
            <p className="text-white font-semibold text-lg mb-8 break-all">
              {email}
            </p>

            {/* Steps */}
            <div className="text-left space-y-4 mb-10 bg-white/3 border border-white/8 rounded-2xl p-6">
              {[
                { step: "1", text: "Otevři email od Performind Studio", done: true },
                { step: "2", text: 'Klikni na tlačítko "Ověřit email a pokračovat"', done: false },
                { step: "3", text: "Vyplníš URL svého eshopu a 2 konkurentů", done: false },
              ].map((item) => (
                <div key={item.step} className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold font-[family-name:var(--font-heading)] ${item.done ? "bg-[#b0f221] text-black" : "bg-white/8 text-white/40"}`}>
                    {item.step}
                  </div>
                  <span className={item.done ? "text-white" : "text-white/50"}>{item.text}</span>
                </div>
              ))}
            </div>

            {/* Time note */}
            <div className="flex items-center justify-center gap-2 text-white/30 text-xs mb-8">
              <Clock className="h-3.5 w-3.5" />
              Email dorazí do 1 minuty · Zkontroluj i spam
            </div>

            {/* Resend */}
            <div className="border-t border-white/8 pt-8">
              <p className="text-white/40 text-sm mb-4">
                Email nedorazil?
              </p>
              {resent ? (
                <div className="flex items-center justify-center gap-2 text-[#b0f221] text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  Znovu odesláno!
                </div>
              ) : (
                <button
                  onClick={handleResend}
                  disabled={resending}
                  className="inline-flex items-center gap-2 text-white/50 hover:text-white text-sm transition-colors disabled:opacity-50"
                >
                  {resending ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ArrowRight className="h-3.5 w-3.5" />
                  )}
                  {resending ? "Odesílám…" : "Poslat znovu"}
                </button>
              )}
            </div>
          </div>

          {/* Footer note */}
          <p className="text-center text-white/20 text-xs mt-6">
            Odkaz je platný 24 hodin · Analýza je zdarma a bez závazků
          </p>
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
