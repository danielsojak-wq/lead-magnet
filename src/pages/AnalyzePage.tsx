import { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowRight, Globe, Search, ShieldCheck, Info, X, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import * as Dialog from "@radix-ui/react-dialog";
import performindLogo from "@/assets/performind-logo-dark.svg";

type VideoType = "meta" | null;

const VIDEO_CONFIG = {
  meta: {
    title: "Jak najít Meta Ads Library URL",
    src: "/videos/meta-ads-library.mp4",
    steps: [
      "Jděte na facebook.com/ads/library",
      "Vyhledejte název e-shopu nebo jeho doménu",
      "Zkopírujte URL stránky s výsledky",
    ],
  },
};

function VideoHelpModal({ type, onClose }: { type: VideoType; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  if (!type) return null;
  const config = VIDEO_CONFIG[type];

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in-0" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl z-50 w-full max-w-lg shadow-2xl p-0 overflow-hidden animate-in fade-in-0 zoom-in-95">
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
            <Dialog.Title className="font-[family-name:var(--font-heading)] font-semibold text-gray-900 text-base">
              {config.title}
            </Dialog.Title>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors"
            >
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>

          {/* Video */}
          <div className="relative bg-gray-950 aspect-video">
            <video
              ref={videoRef}
              src={config.src}
              loop
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
              onError={() => {
                // video not yet uploaded — show placeholder
              }}
            >
              {/* placeholder when video missing */}
            </video>
            {/* overlay if no video yet */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none"
              style={{ display: "none" }}
              ref={(el) => {
                const vid = videoRef.current;
                if (el && vid) {
                  vid.addEventListener("error", () => { el.style.display = "flex"; });
                }
              }}
            >
              <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
                <Play className="h-6 w-6 text-white/60 ml-1" />
              </div>
              <p className="text-white/40 text-xs">Video brzy k dispozici</p>
            </div>
          </div>

          {/* Steps */}
          <div className="px-6 py-5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Postup</p>
            <ol className="space-y-2">
              {config.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#4f11ff]/10 text-[#4f11ff] text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

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
    <div className="space-y-1.5">
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
          className="w-full bg-white border border-gray-200 rounded-xl pl-11 pr-4 py-3 text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4f11ff]/30 focus:border-[#4f11ff] transition-all"
        />
      </div>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function LibraryInput({
  label,
  placeholder,
  value,
  onChange,
  onHelp,
  icon,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onHelp: () => void;
  icon: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">{label}</label>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">nepovinne</span>
        </div>
        <button
          type="button"
          onClick={onHelp}
          className="flex items-center gap-1.5 text-xs text-[#4f11ff] hover:text-[#3d0dcc] font-medium transition-colors"
        >
          <Play className="h-3 w-3" />
          Jak ziskat URL?
        </button>
      </div>
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 flex items-center justify-center">
          {icon}
        </span>
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-11 pr-4 py-3 text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4f11ff]/30 focus:border-[#4f11ff] transition-all"
        />
      </div>
    </div>
  );
}

const MetaIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" fill="#1877F2"/>
  </svg>
);


interface ShopFields {
  url: string;
  meta: string;
}

function ShopSection({
  title,
  badge,
  fields,
  onChange,
  required,
  onHelp,
}: {
  title: string;
  badge?: string;
  fields: ShopFields;
  onChange: (key: keyof ShopFields, v: string) => void;
  required?: boolean;
  onHelp: (type: VideoType) => void;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 p-5 space-y-4 bg-gray-50/40">
      <div className="flex items-center gap-2">
        <span className="font-[family-name:var(--font-heading)] font-semibold text-gray-900 text-sm">{title}</span>
        {badge && (
          <span className="text-xs bg-[#b0f221]/30 text-gray-700 px-2 py-0.5 rounded-full font-medium">{badge}</span>
        )}
      </div>

      <UrlInput
        label="URL e-shopu"
        placeholder="https://eshop.cz"
        value={fields.url}
        onChange={(v) => onChange("url", v)}
        required={required}
      />

      <LibraryInput
        label="Meta Ads Library"
        placeholder="https://facebook.com/ads/library/?..."
        value={fields.meta}
        onChange={(v) => onChange("meta", v)}
        onHelp={() => onHelp("meta")}
        icon={<MetaIcon />}
      />
    </div>
  );
}

const STEPS = [
  { n: 1, label: "Overeni emailu" },
  { n: 2, label: "Zadani URL" },
  { n: 3, label: "Analyza" },
];

const emptyShop = (): ShopFields => ({ url: "", meta: "" });

export default function AnalyzePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [eshop, setEshop] = useState<ShopFields>(emptyShop());
  const [competitor1, setCompetitor1] = useState<ShopFields>(emptyShop());
  const [competitor2, setCompetitor2] = useState<ShopFields>(emptyShop());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoOpen, setVideoOpen] = useState<VideoType>(null);

  const isValid = eshop.url.trim() !== "" && competitor1.url.trim() !== "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);

    const competitors = [
      { url: competitor1.url.trim(), meta_url: competitor1.meta.trim() || undefined, position: 1 },
      ...(competitor2.url.trim()
        ? [{ url: competitor2.url.trim(), meta_url: competitor2.meta.trim() || undefined, position: 2 }]
        : []),
    ];

    const { error: fnErr } = await supabase.functions.invoke("start-lm-analysis", {
      body: {
        session_id: sessionId,
        eshop_url: eshop.url.trim(),
        eshop_meta_url: eshop.meta.trim() || undefined,
        competitors,
      },
    });

    if (fnErr) {
      setError("Nepodařilo se spustit analýzu. Zkuste to prosím znovu.");
      setSubmitting(false);
      return;
    }

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
              Cim vice dat zadáte, tim presnejsi analyza. Ads Library URL jsou nepovinné.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <ShopSection
                title="Váš e-shop"
                badge="vy"
                fields={eshop}
                onChange={(key, v) => setEshop((s) => ({ ...s, [key]: v }))}
                required
                onHelp={setVideoOpen}
              />

              <ShopSection
                title="Konkurent 1"
                fields={competitor1}
                onChange={(key, v) => setCompetitor1((s) => ({ ...s, [key]: v }))}
                required
                onHelp={setVideoOpen}
              />

              <ShopSection
                title="Konkurent 2"
                fields={competitor2}
                onChange={(key, v) => setCompetitor2((s) => ({ ...s, [key]: v }))}
                onHelp={setVideoOpen}
              />

              {error && (
                <p className="text-red-500 text-sm">{error}</p>
              )}

              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 flex gap-3">
                <Info className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                <p className="text-gray-500 text-xs leading-relaxed">
                  Meta Ads Library URL zpresní analyzu reklamního sdělení. Google Ads analyza probíhá automaticky z URL e-shopu.
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

      <VideoHelpModal type={videoOpen} onClose={() => setVideoOpen(null)} />
    </div>
  );
}
