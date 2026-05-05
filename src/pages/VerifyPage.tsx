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
    <div className="min-h-screen bg-white text-gray-900 font-[family-name:var(--font-body)] flex flex-col">

      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center">
          <img src={performindLogo} alt="Performind Studio" className="h-6 object-contain" />
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center">

          {state === "verifying" && (
            <div className="bg-white border border-gray-100 rounded-3xl p-12 shadow-sm">
              <div className="inline-flex w-20 h-20 rounded-2xl bg-[#4f11ff]/8 border border-[#4f11ff]/15 items-center justify-center mb-8">
                <Loader2 className="h-9 w-9 text-[#4f11ff] animate-spin" />
              </div>
              <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold mb-3 text-gray-900">
                Overujeme vas email
              </h1>
              <p className="text-gray-400 text-sm">Chvilku strpeni...</p>
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
                Email overen!
              </h1>
              <p className="text-gray-500 mb-10 leading-relaxed">
                Nyni vyplnte URL adresu vaseho e-shopu a dvou konkurentu,<br className="hidden sm:block" /> abychom mohli spustit analyzu.
              </p>

              <button
                onClick={() => navigate(`/analyze/${sessionId}`)}
                className="inline-flex items-center gap-2 bg-[#4f11ff] hover:bg-[#3d0dcc] text-white font-semibold px-8 py-4 rounded-xl transition-colors text-sm shadow-lg shadow-[#4f11ff]/20"
              >
                Zadat URL a spustit analyzu
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {state === "error" && (
            <div className="bg-white border border-gray-100 rounded-3xl p-12 shadow-sm">
              <div className="inline-flex w-20 h-20 rounded-2xl bg-red-50 border border-red-100 items-center justify-center mb-8">
                <XCircle className="h-9 w-9 text-red-400" />
              </div>

              <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold mb-3 text-gray-900">
                Odkaz neni platny
              </h1>
              <p className="text-gray-500 mb-10 leading-relaxed">
                Overovaci odkaz vypršel nebo byl jiz použit.<br />
                Vraťte se zpet a zadejte email znovu.
              </p>

              <button
                onClick={() => navigate("/")}
                className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-8 py-4 rounded-xl transition-colors text-sm"
              >
                <ArrowRight className="h-4 w-4 rotate-180" />
                Zpet na uvod
              </button>
            </div>
          )}

          <p className="text-gray-400 text-xs mt-6">
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
