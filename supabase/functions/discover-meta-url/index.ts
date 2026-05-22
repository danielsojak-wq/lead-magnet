import { corsHeaders } from "../_shared/cors.ts";

const EXCLUDED = new Set([
  "sharer", "share", "plugins", "tr", "events", "groups", "dialog",
  "login", "home.php", "video.php", "photo.php", "ads", "business",
  "help", "l", "n", "hashtag", "privacy", "policies", "terms",
  "about", "legal", "settings", "watches", "gaming", "marketplace",
  "fundraisers", "bookmarks", "saved", "people", "stories",
  "pages", "watch", "messages", "search", "photo", "video", "reel",
  "notifications", "live", "story", "reels", "profile",
]);

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "cs,en-US;q=0.7,en;q=0.3",
};

// ─── Extract brand name (best for q= search) ──────────────────────────────────

function extractBrandName(html: string): string | null {
  // og:site_name is the most reliable brand identifier
  const ogSite = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']{2,60})["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']{2,60})["'][^>]+property=["']og:site_name["']/i);
  if (ogSite) return ogSite[1].trim();

  // Fallback: <title> — take the LAST segment after | or — (usually the brand)
  const title = html.match(/<title[^>]*>([^<]{2,120})<\/title>/i);
  if (title) {
    const parts = title[1].trim().split(/\s*[|–—\-]\s*/);
    const brand = parts[parts.length - 1].trim();
    if (brand.length >= 2 && brand.length <= 60) return brand;
  }

  return null;
}

// ─── Extract Facebook slugs from HTML ─────────────────────────────────────────

function extractFbSlugs(html: string): string[] {
  const counts = new Map<string, number>();

  // JSON-LD sameAs — high confidence
  for (const block of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const obj = JSON.parse(block[1]);
      const sameAs: unknown[] = Array.isArray(obj?.sameAs) ? obj.sameAs
        : typeof obj?.sameAs === "string" ? [obj.sameAs] : [];
      for (const u of sameAs) {
        const m = String(u).match(/(?:https?:)?\/\/(?:www\.)?facebook\.com\/([a-zA-Z0-9._-]{3,60})/);
        if (m) {
          const slug = m[1].toLowerCase();
          if (!EXCLUDED.has(slug) && !/^\d+$/.test(slug))
            counts.set(slug, (counts.get(slug) ?? 0) + 5);
        }
      }
    } catch { /* skip */ }
  }

  // Broad regex — href, data-href, og tags, script vars
  const fbRe = /(?:https?:)?\/\/(?:www\.)?facebook\.com\/([a-zA-Z0-9._-]{3,60})(?=[/?#"'\s<&\\]|$)/g;
  let m;
  while ((m = fbRe.exec(html)) !== null) {
    const slug = m[1].toLowerCase();
    if (!EXCLUDED.has(slug) && !slug.startsWith("pg/") && !/^\d+$/.test(slug))
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
}

// ─── Try to get numeric page ID from Facebook ──────────────────────────────────

async function resolveFbPageId(slug: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.facebook.com/${encodeURIComponent(slug)}`, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 404) return null;
    const html = await res.text();
    if (html.length < 3000 || res.url?.includes("/login")) return null;

    for (const p of [
      /fb:\/\/profile\/(\d{8,})/,
      /"page_id":"(\d{8,})"/,
      /"entity_id":"(\d{8,})"/,
      /profile_id=(\d{8,})/,
      /"userID":"(\d{8,})"/,
      /"pageID":"(\d{8,})"/,
    ]) {
      const pm = html.match(p);
      if (pm) return pm[1];
    }
  } catch { /* Facebook blocked */ }
  return null;
}

// ─── Generate slug candidates ──────────────────────────────────────────────────

function slugCandidates(siteUrl: string, htmlSlugs: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const push = (s: string) => {
    const n = s.toLowerCase().trim();
    if (n.length >= 3 && !seen.has(n)) { seen.add(n); result.push(n); }
  };

  try {
    const host = new URL(siteUrl).hostname.replace(/^www\./, ""); // e.g. vaskyboots.cz
    const base = host.replace(/\.[^.]+$/, "");                    // e.g. vaskyboots
    push(base);
    push(host);
    push(base.replace(/-/g, ""));
  } catch { /* ignore */ }

  for (const s of htmlSlugs) push(s);
  return result;
}

// ─── Build Meta Ads Library URL ────────────────────────────────────────────────

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

    // ── Step 1: Fetch website HTML ─────────────────────────────────────────────
    let brandName: string | null = null;
    let htmlSlugs: string[] = [];
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
          htmlSlugs = extractFbSlugs(html);
        }
      }
    } catch { /* website unreachable — proceed with guesses */ }

    // Shortcut: numeric profile ID
    if (htmlNumericId) {
      return new Response(JSON.stringify({
        meta_url: buildMetaUrl(null, htmlNumericId),
        page_name: htmlNumericId,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Step 2: Resolve page ID via parallel Facebook probing ─────────────────
    const candidates = slugCandidates(siteUrl, htmlSlugs);
    let pageId: string | null = null;
    let resolvedSlug: string | null = null;

    if (candidates.length) {
      const probes = await Promise.allSettled(
        candidates.map(slug => resolveFbPageId(slug).then(id => ({ slug, id })))
      );
      for (const r of probes) {
        if (r.status === "fulfilled" && r.value.id) {
          pageId = r.value.id;
          resolvedSlug = r.value.slug;
          break;
        }
      }
    }

    // ── Step 3: Build URL ──────────────────────────────────────────────────────
    // Priority: numeric page ID > brand name (og:site_name) > domain slug
    const displayName = resolvedSlug ?? brandName ?? (htmlSlugs[0] ?? candidates[0] ?? null);

    if (!pageId && !brandName && !htmlSlugs.length && !candidates.length) return empty;

    const searchQ = pageId ? null : (brandName ?? htmlSlugs[0] ?? candidates[0] ?? null);

    return new Response(JSON.stringify({
      meta_url: buildMetaUrl(searchQ, pageId),
      page_name: displayName,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("discover-meta-url error:", e);
    return empty;
  }
});
