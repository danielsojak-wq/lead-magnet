import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowRight, Globe, Search, ShieldCheck, Info } from "lucide-react";
import performindLogo from "@/assets/performind-logo.png";

function UrlInput({
  label,
  placeholder,
  value,
  onChange,
  required,
  hint,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        {!required && (
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">nepovinne</span>
        )}
      </div>
      <div className="relative">
        <Globe className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className="w-full bg-white border border-gray-200 rounded-xl pl-11 pr-4 py-3.5 text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4f11ff]/30 focus:border-[#4f11ff] transition-all"
        />
      </div>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

const STEPS = [
  { n: 1, label: "Overeni emailu" },
  { n: 2, label: "Zadani URL" },
  { n: 3, label: "Analyza" },
];

export default function AnalyzePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [eshop, setEshop] = useState("");
  const [competitor1, setCompetitor1] = useState("");
  const [competitor2, setCompetitor2] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = eshop.trim() !== "" && competitor1.trim() !== "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);

    // Placeholder: will call backend Edge Function
    await new Promise((r) => setTimeout(r, 800));

    navigate(`/waiting/${sessionId}`);
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
      <div className="flex-1 flex items-start justify-center px-4 py-12">
        <div className="w-full max-w-xl">

          {/* Progress steps */}
          <div className="flex items-center justify-center gap-0 mb-10">
            {STEPS.map((step, i) => {
              const done = step.n < 2;
              const active = step.n === 2;
              return (
                <div key={step.n} className="flex items-center">
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold font-[family-name:var(--font-heading)] ${
                      done
                        ? "bg-[#b0f221] text-black"
                        : active
                        ? "bg-[#4f11ff] text-white shadow-md shadow-[#4f11ff]/30"
                        : "bg-gray-100 text-gray-400"
                    }`}>
                      {step.n}
                    </div>
                    <span className={`text-xs whitespace-nowrap ${active ? "text-gray-900 font-medium" : done ? "text-gray-500" : "text-gray-300"}`}>
                      {step.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`w-16 sm:w-24 h-px mx-2 mb-5 ${done ? "bg-[#b0f221]/50" : "bg-gray-200"}`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Card */}
          <div className="bg-white border border-gray-100 rounded-3xl p-8 sm:p-10 shadow-sm">

            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-[#4f11ff]/8 border border-[#4f11ff]/15 flex items-center justify-center flex-shrink-0">
                <Search className="h-5 w-5 text-[#4f11ff]" />
              </div>
              <h1 className="font-[family-name:var(--font-heading)] text-xl sm:text-2xl font-bold text-gray-900">
                Zadejte URL adresy
              </h1>
            </div>
            <p className="text-gray-500 text-sm mb-8 ml-[52px]">
              Analyzujeme Google Ads a Meta reklamy - vase i konkurence.
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <UrlInput
                label="Vas e-shop"
                placeholder="https://vas-eshop.cz"
                value={eshop}
                onChange={setEshop}
                required
                hint="URL adresa vasi hlavni domeny nebo produktove stranky"
              />
              <UrlInput
                label="Konkurent 1"
                placeholder="https://konkurent.cz"
                value={competitor1}
                onChange={setCompetitor1}
                required
              />
              <UrlInput
                label="Konkurent 2"
                placeholder="https://druhy-konkurent.cz"
                value={competitor2}
                onChange={setCompetitor2}
              />

              {error && (
                <p className="text-red-500 text-sm">{error}</p>
              )}

              {/* What we analyze */}
              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 flex gap-3">
                <Info className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                <p className="text-gray-500 text-xs leading-relaxed">
                  System automaticky prohledá Google Ads a Meta Ads Library a porovná vase aktivni reklamy s reklamami konkurence. Analyza trvá priblizne 5-10 minut.
                </p>
              </div>

              <button
                type="submit"
                disabled={!isValid || submitting}
                className="w-full flex items-center justify-center gap-2 bg-[#4f11ff] hover:bg-[#3d0dcc] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-4 rounded-xl transition-all text-sm shadow-lg shadow-[#4f11ff]/20"
              >
                {submitting ? "Spoustim analyzu..." : "Spustit analyzu"}
                {!submitting && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>
          </div>

          {/* Trust note */}
          <div className="flex items-center justify-center gap-2 text-gray-400 text-xs mt-6">
            <ShieldCheck className="h-3.5 w-3.5" />
            Analyza je zdarma a bez zavazku · Data zpracovavame pouze interně
          </div>
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
