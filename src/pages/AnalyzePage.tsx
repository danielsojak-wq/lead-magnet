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
        <label className="text-sm font-medium text-white/80">{label}</label>
        {!required && (
          <span className="text-xs text-white/30 bg-white/6 px-2 py-0.5 rounded-full">nepovinné</span>
        )}
      </div>
      <div className="relative">
        <Globe className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className="w-full bg-white/6 border border-white/10 rounded-xl pl-11 pr-4 py-3.5 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-[#4f11ff]/60 focus:bg-white/8 transition-all"
        />
      </div>
      {hint && <p className="text-xs text-white/30">{hint}</p>}
    </div>
  );
}

const STEPS = [
  { n: 1, label: "Ověření emailu" },
  { n: 2, label: "Zadání URL" },
  { n: 3, label: "Analýza" },
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
      <div className="flex-1 flex items-start justify-center px-4 py-12">
        <div className="relative w-full max-w-xl">

          {/* Progress steps */}
          <div className="flex items-center justify-center gap-0 mb-10">
            {STEPS.map((step, i) => {
              const done = step.n < 2;
              const active = step.n === 2;
              return (
                <div key={step.n} className="flex items-center">
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold font-[family-name:var(--font-heading)] border ${
                      done
                        ? "bg-[#b0f221] border-[#b0f221] text-black"
                        : active
                        ? "bg-[#4f11ff] border-[#4f11ff] text-white"
                        : "bg-white/6 border-white/15 text-white/30"
                    }`}>
                      {step.n}
                    </div>
                    <span className={`text-xs whitespace-nowrap ${active ? "text-white" : done ? "text-[#b0f221]" : "text-white/30"}`}>
                      {step.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`w-16 sm:w-24 h-px mx-2 mb-5 ${done ? "bg-[#b0f221]/40" : "bg-white/10"}`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Card */}
          <div className="bg-white/4 border border-white/10 rounded-3xl p-8 sm:p-10">

            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-[#4f11ff]/20 border border-[#4f11ff]/30 flex items-center justify-center flex-shrink-0">
                <Search className="h-5 w-5 text-[#4f11ff]" />
              </div>
              <h1 className="font-[family-name:var(--font-heading)] text-xl sm:text-2xl font-bold">
                Zadejte URL adresy
              </h1>
            </div>
            <p className="text-white/40 text-sm mb-8 ml-[52px]">
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
                <p className="text-red-400 text-sm">{error}</p>
              )}

              {/* What we analyze */}
              <div className="bg-white/3 border border-white/8 rounded-2xl p-4 flex gap-3">
                <Info className="h-4 w-4 text-white/30 flex-shrink-0 mt-0.5" />
                <p className="text-white/40 text-xs leading-relaxed">
                  System automaticky prohledá Google Ads a Meta Ads Library a porovná vase aktivní reklamy s reklamami konkurence. Analyza trvá priblizne 5-10 minut.
                </p>
              </div>

              <button
                type="submit"
                disabled={!isValid || submitting}
                className="w-full flex items-center justify-center gap-2 bg-[#4f11ff] hover:bg-[#4f11ff]/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-4 rounded-xl transition-all text-sm"
              >
                {submitting ? "Spoustim analyzu..." : "Spustit analyzu"}
                {!submitting && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>
          </div>

          {/* Trust note */}
          <div className="flex items-center justify-center gap-2 text-white/20 text-xs mt-6">
            <ShieldCheck className="h-3.5 w-3.5" />
            Analyza je zdarma a bez zavazku - Data zpracovavame pouze interně
          </div>
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
