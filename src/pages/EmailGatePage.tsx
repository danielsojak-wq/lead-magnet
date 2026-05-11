import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowRight, Mail, ShieldCheck, BarChart3, Check } from "lucide-react";
import performindLogo from "@/assets/performind-logo-dark.svg";
import { supabase } from "@/integrations/supabase/client";
import type { UrlFormData } from "./AnalyzePage";

function extractDomain(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function useCountdown(seconds: number) {
  const [remaining, setRemaining] = useState(seconds);
  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  const m = Math.floor(remaining / 60).toString().padStart(2, "0");
  const s = (remaining % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const ANALYSIS_ITEMS = [
  "Reklamní strategie obou konkurentů",
  "Co funguje ve vašem segmentu",
  "3 příležitosti, kde můžete předběhnout konkurenci",
];

export default function EmailGatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const urlData = location.state as UrlFormData | null;

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const countdown = useCountdown(3600);

  if (!urlData?.eshop?.url) {
    navigate("/analyze", { replace: true });
    return null;
  }

  const comp1 = extractDomain(urlData.competitor1.url);
  const comp2 = urlData.competitor2.url ? extractDomain(urlData.competitor2.url) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Zadejte platný pracovní email.");
      return;
    }
    setError("");
    setSubmitting(true);

    const competitors = [
      { url: urlData.competitor1.url, meta_url: urlData.competitor1.meta || undefined, position: 1 },
      ...(urlData.competitor2.url
        ? [{ url: urlData.competitor2.url, meta_url: urlData.competitor2.meta || undefined, position: 2 }]
        : []),
    ];

    const { data, error: fnErr } = await supabase.functions.invoke("send-verification-email", {
      body: {
        email: trimmed,
        eshop_url: urlData.eshop.url,
        eshop_meta_url: urlData.eshop.meta || undefined,
        competitors,
      },
    });

    setSubmitting(false);

    if (fnErr || !data?.session_id) {
      setError("Nepodařilo se odeslat email. Zkuste to prosím znovu.");
      return;
    }

    navigate(`/check-email?session=${data.session_id}&email=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 font-[family-name:var(--font-body)] flex flex-col">

      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center">
          <img src={performindLogo} alt="Performind Studio" className="h-6 object-contain" />
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">

          <div className="bg-white border border-gray-100 rounded-3xl p-8 sm:p-12 shadow-sm">

            {/* Icon */}
            <div className="w-14 h-14 rounded-2xl bg-[#4f11ff]/10 border border-[#4f11ff]/20 flex items-center justify-center mb-6">
              <BarChart3 className="h-7 w-7 text-[#4f11ff]" />
            </div>

            {/* Heading */}
            <h1 className="font-[family-name:var(--font-heading)] text-2xl sm:text-3xl font-bold mb-2 text-gray-900">
              Vaše analýza se připravuje
            </h1>

            {/* Dynamic subtext */}
            <p className="text-gray-500 text-sm mb-6 leading-relaxed">
              Scriptujeme reklamy od{" "}
              <span className="font-medium text-gray-700">{comp1}</span>
              {comp2 && (
                <> a <span className="font-medium text-gray-700">{comp2}</span></>
              )}
              . Zadejte email pro okamžité zobrazení a odeslání výsledků.
            </p>

            {/* What's in the analysis */}
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 mb-6 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Co v analýze najdete</p>
              {ANALYSIS_ITEMS.map((item) => (
                <div key={item} className="flex items-start gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-[#b0f221]/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="h-2.5 w-2.5 text-gray-700" />
                  </div>
                  <span className="text-sm text-gray-600">{item}</span>
                </div>
              ))}
            </div>

            {/* Email form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(""); }}
                    placeholder="vas@firma.cz"
                    autoFocus
                    className={`w-full border rounded-xl pl-11 pr-4 py-3.5 text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-all ${
                      error
                        ? "border-red-300 focus:ring-red-200 focus:border-red-400"
                        : "border-gray-200 focus:ring-[#4f11ff]/30 focus:border-[#4f11ff]"
                    }`}
                  />
                </div>
                {error && <p className="text-xs text-red-500">{error}</p>}
              </div>

              <button
                type="submit"
                disabled={submitting || !email.trim()}
                className="w-full flex items-center justify-center gap-2 bg-[#b0f221] hover:bg-[#a3e01e] disabled:opacity-40 disabled:cursor-not-allowed text-gray-900 font-semibold px-6 py-4 rounded-xl transition-all text-sm shadow-lg shadow-[#b0f221]/30"
              >
                {submitting ? (
                  <span className="w-4 h-4 border-2 border-gray-900/20 border-t-gray-900 rounded-full animate-spin" />
                ) : (
                  <>Zobrazit výsledky <ArrowRight className="h-4 w-4" /></>
                )}
              </button>
            </form>

            {/* Trust badges */}
            <div className="flex items-center justify-center gap-1.5 text-gray-400 text-xs mt-4">
              <ShieldCheck className="h-3.5 w-3.5" />
              Bez spamu · 1× na email · Bez závazku
            </div>

            {/* Countdown */}
            <div className="mt-5 pt-5 border-t border-gray-100 flex items-center justify-center gap-2">
              <span className="text-xs text-gray-400">Analýza expiruje za</span>
              <span className="font-mono text-sm font-semibold text-[#4f11ff]">{countdown}</span>
            </div>

          </div>

        </div>
      </div>

      <footer className="border-t border-gray-100 py-6 px-6 text-center bg-white">
        <p className="text-gray-400 text-xs">© {new Date().getFullYear()} Performind Studio s.r.o.</p>
      </footer>
    </div>
  );
}
