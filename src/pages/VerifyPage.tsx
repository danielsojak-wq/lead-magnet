import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2, ArrowRight } from "lucide-react";
import performindLogo from "@/assets/performind-logo.png";

type State = "verifying" | "success" | "error";

export default function VerifyPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");
  const [state, setState] = useState<State>("verifying");
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState("error");
      return;
    }
    // Placeholder: simulate token verification until backend is ready
    const timer = setTimeout(() => {
      const mockSessionId = crypto.randomUUID();
      setSessionId(mockSessionId);
      setState("success");
    }, 1800);
    return () => clearTimeout(timer);
  }, [token]);

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
        <div className="relative w-full max-w-md text-center">

          {state === "verifying" && (
            <div className="bg-white/4 border border-white/10 rounded-3xl p-12">
              <div className="inline-flex w-20 h-20 rounded-2xl bg-[#4f11ff]/20 border border-[#4f11ff]/30 items-center justify-center mb-8">
                <Loader2 className="h-9 w-9 text-[#4f11ff] animate-spin" />
              </div>
              <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold mb-3">
                Ověřujeme váš email
              </h1>
              <p className="text-white/50 text-sm">Chvilku strpení…</p>
            </div>
          )}

          {state === "success" && (
            <div className="bg-white/4 border border-white/10 rounded-3xl p-12">
              <div className="relative inline-flex mb-8">
                <div className="w-20 h-20 rounded-2xl bg-[#b0f221]/10 border border-[#b0f221]/30 flex items-center justify-center">
                  <CheckCircle2 className="h-9 w-9 text-[#b0f221]" />
                </div>
              </div>

              <h1 className="font-[family-name:var(--font-heading)] text-2xl sm:text-3xl font-bold mb-3">
                Email ověřen!
              </h1>
              <p className="text-white/50 mb-10">
                Nyní vyplňte URL adresu vašeho e-shopu a dvou konkurentů,<br className="hidden sm:block" /> abychom mohli spustit analýzu.
              </p>

              <button
                onClick={() => navigate(`/analyze/${sessionId}`)}
                className="inline-flex items-center gap-2 bg-[#4f11ff] hover:bg-[#4f11ff]/90 text-white font-semibold px-8 py-4 rounded-xl transition-colors text-sm"
              >
                Zadat URL a spustit analýzu
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {state === "error" && (
            <div className="bg-white/4 border border-white/10 rounded-3xl p-12">
              <div className="inline-flex w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 items-center justify-center mb-8">
                <XCircle className="h-9 w-9 text-red-400" />
              </div>

              <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold mb-3">
                Odkaz není platný
              </h1>
              <p className="text-white/50 mb-10">
                Ověřovací odkaz vypršel nebo byl již použit.<br />
                Vraťte se zpět a zadejte email znovu.
              </p>

              <button
                onClick={() => navigate("/")}
                className="inline-flex items-center gap-2 bg-white/8 hover:bg-white/12 text-white font-semibold px-8 py-4 rounded-xl transition-colors text-sm"
              >
                <ArrowRight className="h-4 w-4 rotate-180" />
                Zpět na úvod
              </button>
            </div>
          )}

          <p className="text-white/20 text-xs mt-6">
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
