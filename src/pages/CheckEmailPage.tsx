import { useSearchParams } from "react-router-dom";
import { useState } from "react";
import { Mail, ArrowRight, RefreshCw, CheckCircle2, Clock } from "lucide-react";
import performindLogo from "@/assets/performind-logo-dark.svg";
import { supabase } from "@/integrations/supabase/client";

export default function CheckEmailPage() {
  const [params] = useSearchParams();
  const email = params.get("email") || "vas@email.cz";
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);

  const handleResend = async () => {
    setResending(true);
    await supabase.functions.invoke("send-verification-email", { body: { email } });
    setResending(false);
    setResent(true);
  };

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
        <div className="w-full max-w-lg">

          {/* Card */}
          <div className="bg-white border border-gray-100 rounded-3xl p-8 sm:p-12 text-center shadow-sm">

            {/* Icon */}
            <div className="relative inline-flex mb-8">
              <div className="w-20 h-20 rounded-2xl bg-[#4f11ff]/8 border border-[#4f11ff]/15 flex items-center justify-center">
                <Mail className="h-9 w-9 text-[#4f11ff]" />
              </div>
              <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-[#b0f221] flex items-center justify-center">
                <CheckCircle2 className="h-3.5 w-3.5 text-black" />
              </div>
            </div>

            <h1 className="font-[family-name:var(--font-heading)] text-2xl sm:text-3xl font-bold mb-3 text-gray-900">
              Zkontrolujte svuj email
            </h1>

            <p className="text-gray-500 mb-2">
              Poslali jsme overovaci odkaz na
            </p>
            <p className="text-gray-900 font-semibold text-lg mb-8 break-all">
              {email}
            </p>

            {/* Steps */}
            <div className="text-left space-y-4 mb-10 bg-gray-50 border border-gray-100 rounded-2xl p-6">
              {[
                { step: "1", text: "Otevrete email od Performind Studio", done: true },
                { step: "2", text: 'Kliknete na tlacitko "Overit email a pokracovat"', done: false },
                { step: "3", text: "Vyplnite URL sveho eshopu a 2 konkurentu", done: false },
              ].map((item) => (
                <div key={item.step} className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold font-[family-name:var(--font-heading)] ${item.done ? "bg-[#b0f221] text-black" : "bg-gray-100 text-gray-400"}`}>
                    {item.step}
                  </div>
                  <span className={item.done ? "text-gray-900 font-medium" : "text-gray-400"}>{item.text}</span>
                </div>
              ))}
            </div>

            {/* Time note */}
            <div className="flex items-center justify-center gap-2 text-gray-400 text-xs mb-8">
              <Clock className="h-3.5 w-3.5" />
              Email dorazi do 1 minuty · Zkontrolujte i spam
            </div>

            {/* Resend */}
            <div className="border-t border-gray-100 pt-8">
              <p className="text-gray-400 text-sm mb-4">
                Email nedorazil?
              </p>
              {resent ? (
                <div className="flex items-center justify-center gap-2 text-[#4f11ff] text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  Znovu odeslano!
                </div>
              ) : (
                <button
                  onClick={handleResend}
                  disabled={resending}
                  className="inline-flex items-center gap-2 text-gray-400 hover:text-gray-700 text-sm transition-colors disabled:opacity-50"
                >
                  {resending ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ArrowRight className="h-3.5 w-3.5" />
                  )}
                  {resending ? "Odesilam..." : "Poslat znovu"}
                </button>
              )}
            </div>
          </div>

          {/* Footer note */}
          <p className="text-center text-gray-400 text-xs mt-6">
            Odkaz je platny 24 hodin · Analyza je zdarma a bez zavazku
          </p>
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
