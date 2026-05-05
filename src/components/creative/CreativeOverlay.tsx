import { ClientLogo } from "@/components/ClientLogo";

interface BrandProfile {
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  font_family?: string | null;
}

interface Props {
  imageUrl: string | null;
  headline: string | null;
  cta?: string | null;
  clientSlug: string;
  clientName: string;
  format?: string;
  brand?: BrandProfile | null;
  /** Stable seed (e.g. asset id) used to deterministically pick a layout variant */
  seed?: string;
}

const ASPECT: Record<string, string> = {
  "1:1": "aspect-square",
  "9:16": "aspect-[9/16]",
  "16:9": "aspect-video",
  "4:5": "aspect-[4/5]",
};

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * CSS-based visual overlay with 4 layout variants. Picked deterministically
 * from `seed` so the same asset always renders the same way, but a grid of
 * assets has visual variety.
 */
export function CreativeOverlay({
  imageUrl, headline, cta, clientSlug, clientName, format = "1:1", brand, seed,
}: Props) {
  const aspect = ASPECT[format] || "aspect-square";
  const accent = brand?.primary_color || "#0066ff";
  const font = brand?.font_family || undefined;
  const layoutIdx = seed ? hashSeed(seed) % 4 : 0;

  // Dynamic font size based on headline length
  const headlineSize = headline
    ? headline.length > 40 ? "0.95rem" : headline.length > 24 ? "1.1rem" : "1.3rem"
    : "1.1rem";
  const headlineSizeStory = headline
    ? headline.length > 40 ? "1.1rem" : "1.4rem"
    : "1.25rem";

  const fontStyle = {
    fontFamily: font ? `${font}, system-ui, sans-serif` : undefined,
    fontSize: format === "9:16" ? headlineSizeStory : headlineSize,
  };

  return (
    <div className={`relative w-full ${aspect} bg-muted overflow-hidden`}>
      {imageUrl ? (
        <img src={imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          — bez obrazu —
        </div>
      )}

      {/* Layout 0: Headline top-left + transparent logo top-right + bottom CTA bar */}
      {layoutIdx === 0 && (
        <>
          <div className="absolute inset-x-0 top-0 h-2/5 bg-gradient-to-b from-black/70 via-black/20 to-transparent" />
          <div className="absolute top-3 right-3">
            <ClientLogo slug={clientSlug} name={clientName} className="h-6 w-auto object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" fallbackText />
          </div>
          {headline && (
            <h3 className="absolute top-3 left-3 right-20 text-white font-bold leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]" style={fontStyle}>
              {headline}
            </h3>
          )}
          {cta && (
            <div className="absolute bottom-0 inset-x-0 px-3 py-2 text-[11px] font-semibold tracking-wide text-white text-center" style={{ background: accent }}>
              {cta}
            </div>
          )}
        </>
      )}

      {/* Layout 1: Headline + CTA pill bottom-left, logo bottom-right */}
      {layoutIdx === 1 && (
        <>
          <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          {headline && (
            <h3 className="absolute bottom-12 left-3 right-3 text-white font-bold leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]" style={fontStyle}>
              {headline}
            </h3>
          )}
          {cta && (
            <span className="absolute bottom-3 left-3 inline-flex items-center px-3 py-1.5 rounded-full text-[11px] font-semibold text-white shadow-lg" style={{ background: accent }}>
              {cta} →
            </span>
          )}
          <div className="absolute bottom-3 right-3">
            <ClientLogo slug={clientSlug} name={clientName} className="h-5 w-auto object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" fallbackText />
          </div>
        </>
      )}

      {/* Layout 2: Solid color band header (no gradient on image), inline CTA */}
      {layoutIdx === 2 && (
        <>
          <div className="absolute top-0 inset-x-0 px-3 py-2.5 flex items-center gap-2" style={{ background: `${accent}E6` }}>
            <div className="bg-white/95 rounded px-1.5 py-0.5">
              <ClientLogo slug={clientSlug} name={clientName} className="h-4 w-auto object-contain" fallbackText />
            </div>
            {headline && (
              <h3 className="text-white font-semibold leading-tight flex-1 truncate" style={{ ...fontStyle, fontSize: "0.9rem" }}>
                {headline}
              </h3>
            )}
          </div>
          {cta && (
            <span className="absolute bottom-3 right-3 inline-flex items-center px-3 py-1.5 rounded text-[11px] font-bold uppercase tracking-wide bg-white text-foreground shadow-lg">
              {cta}
            </span>
          )}
        </>
      )}

      {/* Layout 3: Editorial — large headline centered-bottom, logo top-left chip */}
      {layoutIdx === 3 && (
        <>
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/30" />
          <div className="absolute top-3 left-3 bg-white/95 rounded-md px-2 py-1 shadow-md">
            <ClientLogo slug={clientSlug} name={clientName} className="h-4 w-auto object-contain" fallbackText />
          </div>
          {headline && (
            <h3 className="absolute bottom-10 left-4 right-4 text-white font-bold leading-tight text-center drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]" style={fontStyle}>
              {headline}
            </h3>
          )}
          {cta && (
            <div className="absolute bottom-3 inset-x-0 text-center">
              <span className="inline-block px-4 py-1 text-[11px] font-semibold text-white border border-white/70 rounded-full backdrop-blur-sm">
                {cta}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}