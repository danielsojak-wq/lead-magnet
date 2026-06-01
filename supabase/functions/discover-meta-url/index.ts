import { corsHeaders } from "../_shared/cors.ts";
import { extractFbSlugs } from "./_helpers.ts";

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "cs,en-US;q=0.7,en;q=0.3",
};

// ─── Facebook Graph API ────────────────────────────────────────────────────────

// Lookup a single slug via Graph API → returns { pageId, pageName } or null
async function graphLookup(slug: string, token: string): Promise<{ pageId: string; pageName: string } | null> {
  try {
    const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(slug)}?fields=id,name&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.id && !data?.error) return { pageId: String(data.id), pageName: String(data.name ?? slug) };
  } catch { /* timeout or network error */ }
  return null;
}

// Try all candidates against the Graph API and return first hit
async function resolveViaGraphApi(
  candidates: string[],
  token: string,
): Promise<{ slug: string; pageId: string; pageName: string } | null> {
  const results = await Promise.allSettled(
    candidates.map(slug => graphLookup(slug, token).then(r => r ? { slug, ...r } : null))
  );
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) return r.value;
  }
  return null;
}

// ─── Website HTML parsing ──────────────────────────────────────────────────────

function extractBrandName(html: string): string | null {
  const ogSite = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']{2,60})["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']{2,60})["'][^>]+property=["']og:site_name["']/i);
  if (ogSite) return ogSite[1].trim();

  const title = html.match(/<title[^>]*>([^<]{2,120})<\/title>/i);
  if (title) {
    const parts = title[1].trim().split(/\s*[|–—\-]\s*/);
    const brand = parts[parts.length - 1].trim();
    if (brand.length >= 2 && brand.length <= 60) return brand;
  }
  return null;
}


function slugCandidates(siteUrl: string, htmlSlugs: string[], brandName: string | null): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const push = (s: string) => {
    const n = s.toLowerCase().trim();
    if (n.length >= 3 && !seen.has(n)) { seen.add(n); result.push(n); }
  };

  try {
    const host = new URL(siteUrl).hostname.replace(/^www\./, "");
    const base = host.replace(/\.[^.]+$/, "");
    push(base);
    push(host);
    push(base.replace(/-/g, ""));
  } catch { /* ignore */ }

  for (const s of htmlSlugs) push(s);

  // Brand name as slug candidate too (e.g. "Vasky" → try facebook.com/Vasky)
  if (brandName) push(brandName.replace(/\s+/g, "").replace(/[^a-zA-Z0-9._-]/g, ""));

  return result;
}

function buildMetaUrl(q: string | null, pageId: string | null): string | null {
  const base = "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=CZ&is_targeted_country=false&media_type=all";
  if (pageId) return `${base}&search_type=page&view_all_page_id=${pageId}`;
  if (q) return `${base}&search_type=page&q=${encodeURIComponent(q)}`;
  return null;
}

// ─── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const empty = new Response(JSON.stringify({ meta_url: null, page_name: null }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  try {
    const { url } = await req.json().catch(() => ({}));
    if (!url) return empty;
    const siteUrl = String(url);

    const FB_APP_ID = Deno.env.get("FB_APP_ID");
    const FB_APP_SECRET = Deno.env.get("FB_APP_SECRET");
    const fbToken = FB_APP_ID && FB_APP_SECRET ? `${FB_APP_ID}|${FB_APP_SECRET}` : null;

    // ── Step 1: Fetch website HTML ─────────────────────────────────────────────
    let brandName: string | null = null;
    let sameAsSlugs: string[] = [];
    let otherSlugs: string[] = [];
    let htmlNumericId: string | null = null;

    try {
      const res = await fetch(siteUrl, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const html = await res.text();
        const numericMatch = html.match(/facebook\.com\/profile\.php\?id=(\d{8,})/);
        if (numericMatch) {
          htmlNumericId = numericMatch[1];
        } else {
          brandName = extractBrandName(html);
          ({ sameAsSlugs, otherSlugs } = extractFbSlugs(html));
        }
      }
    } catch { /* proceed with guesses */ }

    // Shortcut: numeric profile ID found in HTML
    if (htmlNumericId) {
      return new Response(JSON.stringify({
        meta_url: buildMetaUrl(null, htmlNumericId),
        page_name: htmlNumericId,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const candidates = slugCandidates(siteUrl, [...sameAsSlugs, ...otherSlugs], brandName);

    // ── Step 2: Graph API lookup (reliable, requires FB_APP_ID + FB_APP_SECRET) ─
    if (fbToken && candidates.length) {
      const hit = await resolveViaGraphApi(candidates, fbToken);
      if (hit) {
        return new Response(JSON.stringify({
          meta_url: buildMetaUrl(null, hit.pageId),
          page_name: hit.pageName,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ── Step 3: sameAs slug > other HTML slugs > brandName > domain guess ─────
    const searchQ    = sameAsSlugs[0] ?? otherSlugs[0] ?? brandName ?? candidates[0] ?? null;
    const displayName = sameAsSlugs[0] ?? otherSlugs[0] ?? brandName ?? candidates[0] ?? null;

    if (!searchQ) return empty;

    return new Response(JSON.stringify({
      meta_url: buildMetaUrl(searchQ, null),
      page_name: displayName,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("discover-meta-url error:", e);
    return empty;
  }
});
