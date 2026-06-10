import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowRight, Mail, ShieldCheck, Check, BarChart3 } from "lucide-react";
import performindLogo from "@/assets/performind-logo-dark.svg";
import { supabase } from "@/integrations/supabase/client";
import type { UrlFormData } from "./AnalyzePage";
import { trackEvent, getUtmData } from "@/lib/analytics";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractDomain(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function useCountdown(totalSeconds: number) {
  const [remaining, setRemaining] = useState(totalSeconds);
  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  const m = Math.floor(remaining / 60).toString().padStart(2, "0");
  const s = (remaining % 60).toString().padStart(2, "0");
  return { display: `${m}:${s}`, remaining, total: totalSeconds, expired: remaining === 0 };
}

const ANALYSIS_ITEMS = [
  "Reklamní strategie obou konkurentů",
  "Co funguje ve vašem segmentu",
  "3 příležitosti, kde můžete předběhnout konkurenci",
];

// ─── Blurred results preview (same as WaitingPage) ────────────────────────────

function BlurredPreview() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden>
      <div className="absolute inset-0 scale-[1.04]" style={{ filter: "blur(14px)", opacity: 0.45 }}>
        <div className="min-h-screen bg-gray-50 px-4 py-10 space-y-6 max-w-4xl mx-auto">

          <div className="text-center space-y-2 mb-4">
            <div className="inline-block bg-[#b0f221]/20 text-gray-700 text-xs font-semibold px-4 py-1.5 rounded-full">Konkurenční analýza</div>
            <div className="h-9 w-80 bg-gray-300 rounded-xl mx-auto" />
            <div className="h-4 w-56 bg-gray-200 rounded-lg mx-auto" />
          </div>

          <div className="rounded-3xl bg-gradient-to-br from-[#4f11ff] to-[#7c3aed] p-8 text-white">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-11 h-11 rounded-xl bg-white/15 flex-shrink-0" />
              <div className="space-y-2">
                <div className="h-3 w-32 bg-white/30 rounded" />
                <div className="h-6 w-72 bg-white/60 rounded-lg" />
                <div className="h-3 w-56 bg-white/25 rounded" />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={`rounded-2xl bg-white/10 border border-white/10 p-5 space-y-2 ${i === 2 ? "sm:col-span-2" : ""}`}>
                  <div className="h-3 w-28 bg-white/40 rounded" />
                  {[0, 1, 2].map((j) => (
                    <div key={j} className="space-y-1">
                      <div className="h-3.5 bg-white/50 rounded" style={{ width: `${65 + j * 10}%` }} />
                      <div className="h-2.5 bg-white/25 rounded" style={{ width: `${80 - j * 8}%` }} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl bg-[#4f11ff]/10" />
              <div className="space-y-1.5">
                <div className="h-4 w-52 bg-gray-300 rounded" />
                <div className="h-3 w-72 bg-gray-200 rounded" />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="w-full aspect-square max-w-[220px] mx-auto rounded-full border-8 border-[#4f11ff]/10 flex items-center justify-center">
                  <div className="w-3/4 h-3/4 rounded-full border-4 border-[#4f11ff]/20 flex items-center justify-center">
                    <div className="w-1/2 h-1/2 rounded-full bg-[#4f11ff]/15" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-[#4f11ff]/5 rounded-xl p-3 space-y-1.5">
                    <div className="h-3 w-20 bg-[#4f11ff]/30 rounded" />
                    {[0,1].map(i => <div key={i} className="h-2.5 bg-gray-200 rounded" style={{ width: `${70 + i*10}%` }} />)}
                  </div>
                  <div className="bg-red-50 rounded-xl p-3 space-y-1.5">
                    <div className="h-3 w-20 bg-red-200 rounded" />
                    {[0,1].map(i => <div key={i} className="h-2.5 bg-gray-200 rounded" style={{ width: `${70 + i*10}%` }} />)}
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="h-4 w-24 bg-gray-200 rounded mb-4" />
                {[0, 1, 2].map((i) => (
                  <div key={i} className="border border-gray-100 rounded-xl p-4 space-y-1.5">
                    <div className="flex justify-between gap-3">
                      <div className="h-3.5 bg-gray-300 rounded" style={{ width: `${60 + i * 5}%` }} />
                      <div className="h-5 w-16 rounded-full flex-shrink-0"
                        style={{ background: i === 0 ? "#b0f221" : i === 1 ? "#fef3c7" : "#ede9fe" }} />
                    </div>
                    <div className="h-2.5 bg-gray-200 rounded w-5/6" />
                    <div className="h-2.5 bg-gray-200 rounded w-2/3" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-8 py-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#4f11ff]/10" />
                <div className="space-y-1">
                  <div className="h-4 w-32 bg-gray-300 rounded" />
                  <div className="h-3 w-24 bg-gray-200 rounded" />
                </div>
              </div>
              <div className="h-3 w-16 bg-gray-200 rounded" />
            </div>
            <div className="p-8 space-y-6">
              <div className="grid sm:grid-cols-3 gap-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-4 space-y-2">
                    <div className="h-3 w-20 bg-gray-300 rounded" />
                    <div className="h-6 w-16 bg-[#4f11ff]/20 rounded" />
                    {[0, 1, 2].map((j) => (
                      <div key={j} className="h-2.5 bg-gray-200 rounded" style={{ width: `${75 - j * 10}%` }} />
                    ))}
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-100 pt-6">
                <div className="h-3 w-36 bg-gray-200 rounded mb-4" />
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="aspect-square rounded-xl overflow-hidden">
                      <div className="w-full h-full" style={{ background: `hsl(${220 + i * 15}, 15%, ${88 - i * 3}%)` }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-8 py-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#4f11ff]/10" />
                <div className="space-y-1">
                  <div className="h-4 w-40 bg-gray-300 rounded" />
                  <div className="h-3 w-28 bg-gray-200 rounded" />
                </div>
              </div>
              <div className="h-3 w-16 bg-gray-200 rounded" />
            </div>
            <div className="p-8 space-y-6">
              <div className="grid sm:grid-cols-3 gap-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-4 space-y-2">
                    <div className="h-3 w-20 bg-gray-300 rounded" />
                    <div className="h-6 w-12 bg-[#4f11ff]/20 rounded" />
                    {[0, 1, 2].map((j) => (
                      <div key={j} className="h-2.5 bg-gray-200 rounded" style={{ width: `${80 - j * 12}%` }} />
                    ))}
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-100 pt-6">
                <div className="h-3 w-36 bg-gray-200 rounded mb-4" />
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="aspect-square rounded-xl overflow-hidden">
                      <div className="w-full h-full" style={{ background: `hsl(${260 + i * 12}, 20%, ${85 - i * 4}%)` }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
      {/* gradient vignette */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/60 via-white/20 to-white/60" />
      <div className="absolute inset-0 bg-gradient-to-r from-white/50 via-transparent to-white/50" />
    </div>
  );
}

// ─── Progress ring ────────────────────────────────────────────────────────────

function ProgressRing({ remaining, total }: { remaining: number; total: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const progress = remaining / total;
  const dash = circ * progress;

  return (
    <div className="relative inline-flex items-center justify-center mb-8">
      {/* outer pulse ring */}
      <span className="absolute w-28 h-28 rounded-full border border-[#4f11ff]/20 animate-ping" />
      {/* static outer ring */}
      <div className="w-24 h-24 rounded-full bg-[#4f11ff]/8 border border-[#4f11ff]/10 flex items-center justify-center">
        {/* SVG progress ring */}
        <svg className="absolute w-24 h-24 -rotate-90" viewBox="0 0 96 96">
          {/* track */}
          <circle cx="48" cy="48" r={r} fill="none" stroke="#4f11ff" strokeOpacity="0.08" strokeWidth="4" />
          {/* progress */}
          <circle
            cx="48" cy="48" r={r}
            fill="none"
            stroke="#4f11ff"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
            style={{ transition: "stroke-dasharray 1s linear" }}
          />
        </svg>
        {/* inner icon */}
        <div className="w-14 h-14 rounded-full bg-[#4f11ff]/10 border border-[#4f11ff]/20 flex items-center justify-center z-10">
          <BarChart3 className="h-6 w-6 text-[#4f11ff]" />
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EmailGatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const urlData = location.state as UrlFormData | null;

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const honeypotRef = useRef<HTMLInputElement>(null);

  const { display: countdown, remaining, total, expired } = useCountdown(12 * 60);

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
      { url: urlData.competitor1.url, meta_url: urlData.competitor1.meta || undefined, fb_slug: urlData.competitor1.fbSlug || undefined, position: 1 },
      ...(urlData.competitor2.url
        ? [{ url: urlData.competitor2.url, meta_url: urlData.competitor2.meta || undefined, fb_slug: urlData.competitor2.fbSlug || undefined, position: 2 }]
        : []),
    ];

    // Sdílené event_id pro Meta dedup: stejné jde do Pixelu (GTM přes dataLayer)
    // i do CAPI (přes send-verification-email). _fbp/_fbc z cookie pro lepší match.
    const leadEventId = crypto.randomUUID();
    const getCookie = (n: string) =>
      document.cookie.match("(?:^|; )" + n.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)")?.[1];
    const fbp = getCookie("_fbp");
    const fbc = getCookie("_fbc");

    trackEvent({ event: "email_submitted", session_id: null, lead_event_id: leadEventId, ...(getUtmData() ?? {}) });

    const { data, error: fnErr } = await supabase.functions.invoke("send-verification-email", {
      body: {
        email: trimmed,
        eshop_url: urlData.eshop.url,
        eshop_meta_url: urlData.eshop.meta || undefined,
        eshop_fb_slug: urlData.eshop.fbSlug || undefined,
        competitors,
        website: honeypotRef.current?.value ?? "",
        lead_event_id: leadEventId,
        fbp,
        fbc,
        event_source_url: window.location.href,
      },
    });

    setSubmitting(false);

    if (fnErr) {
      // Try to extract rate limit message from 429 response body
      try {
        const ctx = (fnErr as unknown as { context?: Response }).context;
        if (ctx) {
          const body = await ctx.json() as { error?: string; message?: string; limit_type?: string; period?: string };
          if (body?.error === "rate_limit") {
            trackEvent({
              event: "rate_limit_hit",
              limit_type: body.limit_type ?? null,
              period: body.period ?? null,
              ...(getUtmData() ?? {}),
            });
            setError(body.message ?? "Překročen limit analýz.");
            return;
          }
        }
      } catch {
        // context parse failed — fall through to generic error
      }
      setError("Nepodařilo se odeslat email. Zkuste to prosím znovu.");
      return;
    }

    if (!data?.session_id) {
      setError("Nepodařilo se odeslat email. Zkuste to prosím znovu.");
      return;
    }

    navigate(`/check-email?session=${data.session_id}&email=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="relative min-h-screen bg-white text-gray-900 font-[family-name:var(--font-body)] flex flex-col overflow-hidden">

      {/* Blurred results preview in background */}
      <BlurredPreview />

      {/* Frosted overlay */}
      <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px]" />

      {/* Content */}
      <div className="relative z-10 flex flex-col min-h-screen">

        <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
            <img src={performindLogo} alt="Performind Marketing" className="h-5 object-contain" />
            <span className="hidden sm:flex items-center gap-1.5 bg-[#4f11ff]/8 text-[#4f11ff] text-xs font-semibold px-2.5 py-1 rounded-full border border-[#4f11ff]/15 tracking-wide uppercase">
              Analýza konkurence
            </span>
          </div>
        </nav>

        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md">

            <div className="bg-white/90 border border-gray-100 rounded-3xl p-8 sm:p-12 shadow-sm backdrop-blur-sm text-center">

              {expired ? (
                /* ── Expired state ── */
                <>
                  <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-6">
                    <svg className="h-8 w-8 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold mb-3 text-gray-900">
                    Analýza byla zastavena
                  </h1>
                  <p className="text-gray-500 text-sm mb-8 leading-relaxed">
                    Vypršel časový limit pro zadání emailu. Analýza byla z bezpečnostních důvodů zrušena. Celý proces můžete spustit znovu.
                  </p>
                  <button
                    onClick={() => navigate("/")}
                    className="w-full flex items-center justify-center gap-2 bg-[#4f11ff] hover:bg-[#3d0dcc] text-white font-semibold px-6 py-4 rounded-xl transition-all text-sm"
                  >
                    Zpět na úvod <ArrowRight className="h-4 w-4" />
                  </button>
                </>
              ) : (
                /* ── Normal state ── */
                <>
                  {/* Progress ring */}
                  <ProgressRing remaining={remaining} total={total} />

                  {/* Heading */}
                  <h1 className="font-[family-name:var(--font-heading)] text-2xl sm:text-3xl font-bold mb-2 text-gray-900">
                    Vaše analýza se připravuje
                  </h1>

                  {/* Subtext */}
                  <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                    Zadejte svůj email — výsledky vám zobrazíme okamžitě a zároveň je odešleme přímo do vašeho inboxu.
                  </p>

                  {/* What's in the analysis */}
                  <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 mb-6 text-left space-y-2">
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
                    {/* Honeypot — hidden from humans, filled by bots */}
                    <input
                      ref={honeypotRef}
                      type="text"
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                      aria-hidden="true"
                      style={{ position: "absolute", left: "-9999px", opacity: 0 }}
                    />
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
                      {error && <p className="text-xs text-red-500 text-left">{error}</p>}
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
                </>
              )}

              {/* Countdown — only shown when not expired */}
              {!expired && (
                <div className="mt-5 pt-5 border-t border-gray-100 flex items-center justify-center gap-2">
                  <span className="text-xs text-gray-400">Odkaz expiruje za</span>
                  <span className={`font-mono text-sm font-semibold transition-colors ${remaining < 60 ? "text-red-500" : "text-[#4f11ff]"}`}>{countdown}</span>
                </div>
              )}

            </div>
          </div>
        </div>

        <footer className="border-t border-gray-100 py-6 px-6 text-center bg-white/70">
          <p className="text-gray-400 text-xs">© {new Date().getFullYear()} Performind Marketing s.r.o.</p>
        </footer>
      </div>
    </div>
  );
}
