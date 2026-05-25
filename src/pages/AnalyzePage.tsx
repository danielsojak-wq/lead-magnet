import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Globe, Search, ShieldCheck, Info, X, Play, Maximize2, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import performindLogo from "@/assets/performind-logo-dark.svg";
import { supabase } from "@/integrations/supabase/client";

// ─── URL helpers ──────────────────────────────────────────────────────────────

function normalizeWebUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const withProtocol = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const url = new URL(withProtocol);
    if (!url.hostname.includes(".")) return null;
    return url.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

type UrlStatus = "idle" | "checking" | "valid" | "invalid";

function useUrlCheck(raw: string): UrlStatus {
  const [status, setStatus] = useState<UrlStatus>("idle");

  useEffect(() => {
    const normalized = normalizeWebUrl(raw);
    if (!normalized) { setStatus("idle"); return; }

    setStatus("checking");
    const timer = setTimeout(async () => {
      try {
        const hostname = new URL(normalized).hostname;
        const res = await fetch(`https://dns.google/resolve?name=${hostname}&type=A`);
        const json = await res.json();
        setStatus(json.Status === 0 && json.Answer?.length > 0 ? "valid" : "invalid");
      } catch {
        setStatus("idle");
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [raw]);

  return status;
}

function validateMetaUrl(raw: string): boolean {
  if (!raw.trim()) return true;
  const s = raw.trim().toLowerCase();
  return s.includes("facebook.com/ads/library") || s.includes("fb.com/ads/library");
}

function useMetaUrlCheck(raw: string): UrlStatus {
  if (!raw.trim()) return "idle";
  const s = raw.trim().toLowerCase();
  if (!s.includes("facebook.com/ads/library") && !s.includes("fb.com/ads/library")) {
    return "invalid";
  }
  try {
    const url = new URL(raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`);
    const hasContent = url.searchParams.has("q") || url.searchParams.has("view_all_page_id");
    return hasContent ? "valid" : "invalid";
  } catch {
    return "invalid";
  }
}

type DiscoveryStatus = "idle" | "searching" | "found" | "not_found";

function useDiscoverMeta(urlStatus: UrlStatus, normalizedUrl: string | null): {
  status: DiscoveryStatus;
  pageName: string | null;
  metaUrl: string | null;
} {
  const [status, setStatus] = useState<DiscoveryStatus>("idle");
  const [pageName, setPageName] = useState<string | null>(null);
  const [metaUrl, setMetaUrl] = useState<string | null>(null);
  const lastUrl = useRef<string | null>(null);

  useEffect(() => {
    if (urlStatus !== "valid" || !normalizedUrl) {
      if (urlStatus === "idle" || urlStatus === "checking") {
        setStatus("idle");
        setPageName(null);
        setMetaUrl(null);
        lastUrl.current = null;
      }
      return;
    }
    if (normalizedUrl === lastUrl.current) return;
    lastUrl.current = normalizedUrl;

    setStatus("searching");
    setPageName(null);
    setMetaUrl(null);

    supabase.functions.invoke("discover-meta-url", { body: { url: normalizedUrl } })
      .then(({ data }) => {
        if (data?.meta_url) {
          setMetaUrl(data.meta_url);
          setPageName(data.page_name ?? null);
          setStatus("found");
        } else {
          setStatus("not_found");
        }
      })
      .catch(() => setStatus("not_found"));
  }, [urlStatus, normalizedUrl]);

  return { status, pageName, metaUrl };
}

const VIDEO_CONFIG = {
  meta: {
    title: "Jak najít Meta Ads Library URL",
    src: "/videos/meta-ads-library.mp4",
    steps: [
      <span>Jděte na <a href="https://www.facebook.com/ads/library" target="_blank" rel="noopener noreferrer" className="text-[#4f11ff] underline underline-offset-2 break-all">facebook.com/ads/library</a></span>,
      "Vyhledejte název e-shopu nebo jeho doménu",
      "Zkopírujte URL stránky s výsledky",
    ] as React.ReactNode[],
  },
};

type VideoType = "meta" | null;

function VideoHelpModal({ type, onClose }: { type: VideoType; onClose: () => void }) {
  if (!type) return null;
  const config = VIDEO_CONFIG[type];
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      {/* Expanded "full view" overlay */}
      {expanded && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 sm:p-8 animate-in fade-in-0">
          <div className="relative w-full max-w-5xl">
            <video
              src={config.src}
              loop
              autoPlay
              muted
              playsInline
              className="w-full rounded-xl shadow-2xl"
            />
            <button
              onClick={() => setExpanded(false)}
              className="absolute -top-4 -right-4 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
              aria-label="Zavřít"
            >
              <X className="h-5 w-5 text-gray-700" />
            </button>
          </div>
        </div>
      )}

    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in-0" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl z-50 w-full max-w-lg shadow-2xl p-0 overflow-hidden animate-in fade-in-0 zoom-in-95">
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
            <Dialog.Title className="font-[family-name:var(--font-heading)] font-semibold text-gray-900 text-base">
              {config.title}
            </Dialog.Title>
            <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors">
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>
          <div className="relative bg-gray-950 aspect-video group">
            <video
              src={config.src}
              loop
              autoPlay
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />
            <button
              onClick={() => setExpanded(true)}
              className="absolute bottom-3 right-3 w-8 h-8 bg-black/50 hover:bg-black/75 rounded-lg flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 z-10"
              aria-label="Zobrazit větší"
            >
              <Maximize2 className="h-4 w-4 text-white" />
            </button>
          </div>
          <div className="px-6 py-5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Postup</p>
            <ol className="space-y-2">
              {config.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#4f11ff]/10 text-[#4f11ff] text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    </>
  );
}

// ─── Input components ─────────────────────────────────────────────────────────

function UrlInput({ label, placeholder, value, onChange, required, error, urlStatus: externalStatus }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void;
  required?: boolean; error?: string; urlStatus?: UrlStatus;
}) {
  const internalStatus = useUrlCheck(externalStatus !== undefined ? "" : value);
  const urlStatus = externalStatus ?? internalStatus;

  const borderClass = error
    ? "border-red-300 focus:ring-red-200 focus:border-red-400"
    : urlStatus === "valid"
    ? "border-green-300 focus:ring-green-200 focus:border-green-400"
    : urlStatus === "invalid"
    ? "border-orange-300 focus:ring-orange-200 focus:border-orange-400"
    : "border-gray-200 focus:ring-[#4f11ff]/30 focus:border-[#4f11ff]";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        {!required && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">nepovinné</span>}
      </div>
      <div className="relative">
        <Globe className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className={`w-full bg-white border rounded-xl pl-11 pr-10 py-3 text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-all ${borderClass}`}
        />
        {/* Status icon inside input */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          {urlStatus === "checking" && <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />}
          {urlStatus === "valid"    && <CheckCircle2 className="h-4 w-4 text-green-500" />}
          {urlStatus === "invalid"  && <AlertCircle className="h-4 w-4 text-orange-400" />}
        </div>
      </div>
      {/* Status message */}
      {!error && urlStatus === "valid"   && <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Doména je dostupná</p>}
      {!error && urlStatus === "invalid" && <p className="text-xs text-orange-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Doména nebyla nalezena — zkontrolujte URL</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

function LibraryInput({ label, placeholder, value, onChange, onHelp, icon, error }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void;
  onHelp: () => void; icon: React.ReactNode; error?: string;
}) {
  const metaStatus = useMetaUrlCheck(value);

  const borderClass = error
    ? "border-red-300 focus:ring-red-200 focus:border-red-400"
    : metaStatus === "valid"
    ? "border-green-300 focus:ring-green-200 focus:border-green-400"
    : metaStatus === "invalid"
    ? "border-orange-300 focus:ring-orange-200 focus:border-orange-400"
    : "border-gray-200 focus:ring-[#4f11ff]/30 focus:border-[#4f11ff]";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">{label}</label>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">nepovinné</span>
        </div>
        <button type="button" onClick={onHelp} className="flex items-center gap-1.5 text-xs text-[#4f11ff] hover:text-[#3d0dcc] font-medium transition-colors">
          <Play className="h-3 w-3" /> Jak získat URL?
        </button>
      </div>
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 flex items-center justify-center">{icon}</span>
        <input
          type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className={`w-full bg-gray-50 border rounded-xl pl-11 pr-10 py-3 text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-all ${borderClass}`}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          {metaStatus === "valid"   && <CheckCircle2 className="h-4 w-4 text-green-500" />}
          {metaStatus === "invalid" && <AlertCircle className="h-4 w-4 text-orange-400" />}
        </div>
      </div>
      {!error && metaStatus === "valid"   && <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> URL je platná — odkaz na výsledky Meta Ads Library</p>}
      {!error && metaStatus === "invalid" && value.trim() && (
        <p className="text-xs text-orange-500 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {!value.toLowerCase().includes("facebook.com/ads/library")
            ? "Musí jít o odkaz z Meta Ads Library (facebook.com/ads/library)"
            : "URL nevede na konkrétní výsledky — vyhledejte e-shop a zkopírujte URL stránky s výsledky"}
        </p>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

const MetaIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" fill="#1877F2"/>
  </svg>
);

export interface UrlFormData {
  eshop: { url: string; meta: string };
  competitor1: { url: string; meta: string };
  competitor2: { url: string; meta: string };
}

interface ShopErrors { url?: string; meta?: string; }

function ShopSection({ title, badge, fields, onChange, required, onHelp, errors }: {
  title: string; badge?: string;
  fields: { url: string; meta: string };
  onChange: (key: "url" | "meta", v: string) => void;
  required?: boolean; onHelp: (type: VideoType) => void; errors?: ShopErrors;
}) {
  const urlStatus = useUrlCheck(fields.url);
  const normalizedUrl = normalizeWebUrl(fields.url);
  const discovery = useDiscoverMeta(urlStatus, normalizedUrl);
  const [metaEnteredManually, setMetaEnteredManually] = useState(false);

  // Auto-fill meta when discovery succeeds (only if user hasn't manually entered)
  useEffect(() => {
    if (discovery.status === "found" && discovery.metaUrl && !metaEnteredManually) {
      onChange("meta", discovery.metaUrl);
    }
  }, [discovery.status, discovery.metaUrl, metaEnteredManually]);

  const handleUrlChange = (v: string) => {
    if (fields.meta.trim() && !metaEnteredManually) {
      onChange("meta", "");
    }
    onChange("url", v);
  };

  const handleMetaChange = (v: string) => {
    setMetaEnteredManually(v.trim() !== "");
    onChange("meta", v);
  };

  const showMetaInput = discovery.status === "not_found" || metaEnteredManually;

  return (
    <div className={`rounded-2xl border p-5 space-y-4 bg-gray-50/40 transition-colors ${errors?.url || errors?.meta ? "border-red-200" : "border-gray-100"}`}>
      <div className="flex items-center gap-2">
        <span className="font-[family-name:var(--font-heading)] font-semibold text-gray-900 text-sm">{title}</span>
        {badge && <span className="text-xs bg-[#b0f221]/30 text-gray-700 px-2 py-0.5 rounded-full font-medium">{badge}</span>}
      </div>

      <div className="space-y-1.5">
        <UrlInput label="URL webu" placeholder="eshop.cz nebo https://eshop.cz" value={fields.url} onChange={handleUrlChange} required={required} error={errors?.url} urlStatus={urlStatus} />
        {!errors?.meta && (
          <>
            {discovery.status === "searching" && (
              <p className="text-xs text-gray-500 flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Hledám Facebook stránku...</p>
            )}
            {discovery.status === "found" && (
              <p className="text-xs text-green-600 flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3" /> Nalezena Facebook stránka: <span className="font-medium">{discovery.pageName}</span></p>
            )}
            {discovery.status === "not_found" && !fields.meta.trim() && (
              <p className="text-xs text-amber-600 flex items-center gap-1.5"><AlertCircle className="h-3 w-3" /> Facebook stránka nenalezena — zadejte URL Meta Ads Library ručně</p>
            )}
          </>
        )}
      </div>

      {showMetaInput && (
        <LibraryInput label="Meta Ads Library URL" placeholder="https://facebook.com/ads/library/?..." value={fields.meta} onChange={handleMetaChange} onHelp={() => onHelp("meta")} icon={<MetaIcon />} error={errors?.meta} />
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const empty = () => ({ url: "", meta: "" });

export default function AnalyzePage() {
  const navigate = useNavigate();

  const [eshop, setEshop] = useState(empty());
  const [competitor1, setCompetitor1] = useState(empty());
  const [competitor2, setCompetitor2] = useState(empty());
  const [videoOpen, setVideoOpen] = useState<VideoType>(null);
  const [fieldErrors, setFieldErrors] = useState<{ eshop: ShopErrors; comp1: ShopErrors; comp2: ShopErrors }>({ eshop: {}, comp1: {}, comp2: {} });

  const isValid = eshop.url.trim() !== "" && competitor1.url.trim() !== "";

  const validate = (): boolean => {
    const errs = { eshop: {} as ShopErrors, comp1: {} as ShopErrors, comp2: {} as ShopErrors };
    let ok = true;

    const checkShop = (fields: { url: string; meta: string }, target: ShopErrors, required: boolean) => {
      if (required && !fields.url.trim()) { target.url = "URL webu je povinné."; ok = false; }
      else if (fields.url.trim() && !normalizeWebUrl(fields.url)) { target.url = "Zadejte platnou URL (např. eshop.cz)."; ok = false; }
      if (fields.meta.trim() && !validateMetaUrl(fields.meta)) { target.meta = "Musí jít o odkaz z Meta Ads Library."; ok = false; }
    };

    checkShop(eshop, errs.eshop, true);
    checkShop(competitor1, errs.comp1, true);
    if (competitor2.url.trim() || competitor2.meta.trim()) checkShop(competitor2, errs.comp2, false);
    setFieldErrors(errs);
    return ok;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    if (!validate()) return;

    const norm = (url: string) => normalizeWebUrl(url) ?? url.trim();

    const data: UrlFormData = {
      eshop:       { url: norm(eshop.url),       meta: eshop.meta.trim() },
      competitor1: { url: norm(competitor1.url), meta: competitor1.meta.trim() },
      competitor2: { url: norm(competitor2.url), meta: competitor2.meta.trim() },
    };

    navigate("/get-email", { state: data });
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 font-[family-name:var(--font-body)] flex flex-col">

      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center">
          <img src={performindLogo} alt="Performind Marketing" className="h-6 object-contain" />
        </div>
      </nav>

      <div className="flex-1 flex items-start justify-center px-4 py-12">
        <div className="w-full max-w-xl">

          <div className="bg-white border border-gray-100 rounded-3xl p-8 sm:p-10 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-[#4f11ff]/8 border border-[#4f11ff]/15 flex items-center justify-center flex-shrink-0">
                <Search className="h-5 w-5 text-[#4f11ff]" />
              </div>
              <h1 className="font-[family-name:var(--font-heading)] text-xl sm:text-2xl font-bold text-gray-900">Zadejte URL adresy</h1>
            </div>
            <p className="text-gray-500 text-sm mb-8 ml-[52px]">Zadejte URL e-shopu a konkurentů — Meta Ads Library URL dohledáme automaticky.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <ShopSection title="Váš e-shop" badge="vy" fields={eshop}
                onChange={(k, v) => { setEshop(s => ({ ...s, [k]: v })); setFieldErrors(e => ({ ...e, eshop: { ...e.eshop, [k]: undefined } })); }}
                required onHelp={setVideoOpen} errors={fieldErrors.eshop} />

              <ShopSection title="Konkurent 1" fields={competitor1}
                onChange={(k, v) => { setCompetitor1(s => ({ ...s, [k]: v })); setFieldErrors(e => ({ ...e, comp1: { ...e.comp1, [k]: undefined } })); }}
                required onHelp={setVideoOpen} errors={fieldErrors.comp1} />

              <ShopSection title="Konkurent 2" fields={competitor2}
                onChange={(k, v) => { setCompetitor2(s => ({ ...s, [k]: v })); setFieldErrors(e => ({ ...e, comp2: { ...e.comp2, [k]: undefined } })); }}
                onHelp={setVideoOpen} errors={fieldErrors.comp2} />

              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 flex gap-3">
                <Info className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                <p className="text-gray-500 text-xs leading-relaxed">Meta Ads Library URL dohledáme automaticky. Pokud stránku nenajdeme, budete vyzváni k ručnímu zadání.</p>
              </div>

              <button type="submit" disabled={!isValid}
                className="w-full flex items-center justify-center gap-2 bg-[#b0f221] hover:bg-[#a3e01e] disabled:opacity-40 disabled:cursor-not-allowed text-gray-900 font-semibold px-6 py-4 rounded-xl transition-all text-sm shadow-lg shadow-[#b0f221]/30">
                Spustit analýzu <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>

          <div className="flex items-center justify-center gap-2 text-gray-400 text-xs mt-6">
            <ShieldCheck className="h-3.5 w-3.5" />
            Analýza je zdarma a bez závazku · Data zpracováváme pouze interně
          </div>
        </div>
      </div>

      <footer className="border-t border-gray-100 py-6 px-6 text-center bg-white">
        <p className="text-gray-400 text-xs">© {new Date().getFullYear()} Performind Marketing s.r.o.</p>
      </footer>

      <VideoHelpModal type={videoOpen} onClose={() => setVideoOpen(null)} />
    </div>
  );
}
