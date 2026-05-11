import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2, ArrowRight } from "lucide-react";
import performindLogo from "@/assets/performind-logo-dark.svg";
import { supabase } from "@/integrations/supabase/client";

type State = "verifying" | "starting" | "success" | "expired" | "error";

export default function VerifyPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");
  const [state, setState] = useState<State>("verifying");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("Ověřovací odkaz není platný nebo vypršel.");

  useEffect(() => {
    if (!token) {
      setState("error");
      return;
    }

    supabase.functions
      .invoke("verify-lm-token", { body: { token } })
      .then(async ({ data, error }) => {
        if (error || !data?.session_id) {
          const msg = data?.error || error?.message || "";
          if (msg.includes("vypršel")) {
            setState("expired");
          } else {
            setState("error");
          }
          if (msg) setErrorMsg(msg);
          return;
        }

        const sid = data.session_id;
        setSessionId(sid);
        setState("starting");

        // Kick off analysis — backend reads stored URLs from DB
        const { error: analysisErr } = await supabase.functions.invoke("start-lm-analysis", {
          body: { session_id: sid },
        });

        if (analysisErr) {
          setErrorMsg("Analýzu se nepodařilo spustit. Zkuste to prosím znovu.");
          setState("error");
          return;
        }

        setState("success");
      });
  }, [token]);

  useEffect(() => {
    if (state === "success" && sessionId) {
      const t = setTimeout(() => navigate(`/waiting/${sessionId}`), 1500);
      return () => clearTimeout(t);
    }
  }, [state, sessionId, navigate]);

  return (
    <div className="min-h-screen bg-white text-gray-900 font-[family-name:var(--font-body)] flex flex-col">

      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center">
          <img src={performindLogo} alt="Performind Marketing" className="h-6 object-contain" />
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center">

          {(state === "verifying" || state === "starting") && (
            <div className="bg-white border border-gray-100 rounded-3xl p-12 shadow-sm">
              <div className="inline-flex w-20 h-20 rounded-2xl bg-[#4f11ff]/8 border border-[#4f11ff]/15 items-center justify-center mb-8">
                <Loader2 className="h-9 w-9 text-[#4f11ff] animate-spin" />
              </div>
              <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold mb-3 text-gray-900">
                {state === "verifying" ? "Ověřujeme váš email" : "Spouštíme analýzu"}
              </h1>
              <p className="text-gray-400 text-sm">Chvilku strpení…</p>
            </div>
          )}

          {state === "success" && (
            <div className="bg-white border border-gray-100 rounded-3xl p-12 shadow-sm">
              <div className="relative inline-flex mb-8">
                <div className="w-20 h-20 rounded-2xl bg-[#b0f221]/15 border border-[#b0f221]/30 flex items-center justify-center">
                  <CheckCircle2 className="h-9 w-9 text-[#4f11ff]" />
                </div>
                <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-[#b0f221] flex items-center justify-center">
                  <CheckCircle2 className="h-3.5 w-3.5 text-black" />
                </div>
              </div>
              <h1 className="font-[family-name:var(--font-heading)] text-2xl sm:text-3xl font-bold mb-3 text-gray-900">
                Analýza spuštěna!
              </h1>
              <p className="text-gray-500 mb-8 leading-relaxed">
                Přesměrováváme vás na výsledky…
              </p>
              <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div className="bg-[#4f11ff] h-1.5 rounded-full animate-[progress_1.5s_linear_forwards]" />
              </div>
            </div>
          )}

          {state === "expired" && (
            <div className="bg-white border border-gray-100 rounded-3xl p-12 shadow-sm">
              <div className="inline-flex w-20 h-20 rounded-2xl bg-amber-50 border border-amber-100 items-center justify-center mb-8">
                <XCircle className="h-9 w-9 text-amber-400" />
              </div>
              <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold mb-3 text-gray-900">
                Odkaz vypršel
              </h1>
              <p className="text-gray-500 mb-10 leading-relaxed">
                Ověřovací odkaz je platný 24 hodin. Vraťte se zpět a zadejte URL adresy znovu — pošleme nový odkaz.
              </p>
              <button
                onClick={() => navigate("/analyze")}
                className="inline-flex items-center gap-2 bg-[#b0f221] hover:bg-[#a3e01e] text-gray-900 font-semibold px-8 py-4 rounded-xl transition-colors text-sm"
              >
                Zpět na analýzu <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {state === "error" && (
            <div className="bg-white border border-gray-100 rounded-3xl p-12 shadow-sm">
              <div className="inline-flex w-20 h-20 rounded-2xl bg-red-50 border border-red-100 items-center justify-center mb-8">
                <XCircle className="h-9 w-9 text-red-400" />
              </div>
              <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold mb-3 text-gray-900">
                Něco se pokazilo
              </h1>
              <p className="text-gray-500 mb-10 leading-relaxed">
                {errorMsg}
              </p>
              <button
                onClick={() => navigate("/analyze")}
                className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-8 py-4 rounded-xl transition-colors text-sm"
              >
                <ArrowRight className="h-4 w-4 rotate-180" /> Zpět na analýzu
              </button>
            </div>
          )}

          <p className="text-gray-400 text-xs mt-6">
            Odkaz je platný 24 hodin · Analýza je zdarma a bez závazku
          </p>
        </div>
      </div>

      <footer className="border-t border-gray-100 py-6 px-6 text-center bg-white">
        <p className="text-gray-400 text-xs">
          © {new Date().getFullYear()} Performind Marketing s.r.o.
        </p>
      </footer>
    </div>
  );
}
