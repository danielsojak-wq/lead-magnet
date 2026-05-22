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

function domainBase(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").replace(/\.[^.]+$/, "").toLowerCase();
  } catch { return ""; }
}

function extractFbSlugs(html: string): Map<string, number> {
  const counts = new Map<string, number>();

  // 1. JSON-LD sameAs (highest confidence)
  const jsonLdBlocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of jsonLdBlocks) {
    try {
      const obj = JSON.parse(block[1]);
      const sameAs: string[] = Array.isArray(obj?.sameAs) ? obj.sameAs
        : typeof obj?.sameAs === "string" ? [obj.sameAs] : [];
      for (const u of sameAs) {
        const m = String(u).match(/(?:https?:)?\/\/(?:www\.)?facebook\.com\/([a-zA-Z0-9._-]{3,60})/);
        if (m) {
          const slug = m[1].toLowerCase();
          if (!EXCLUDED.has(slug) && !/^\d+$/.test(slug)) {
            // Boost JSON-LD entries so they rank higher
            counts.set(slug, (counts.get(slug) ?? 0) + 5);
          }
        }
      }
    } catch { /* skip */ }
  }

  // 2. Broad regex — href, data-href, og tags, script vars, protocol-relative
  const fbRe = /(?:https?:)?\/\/(?:www\.)?facebook\.com\/([a-zA-Z0-9._-]{3,60})(?=[/?#"'\s<&\\]|$)/g;
  let m;
  while ((m = fbRe.exec(html)) !== null) {
    const slug = m[1].toLowerCase();
    if (EXCLUDED.has(slug) || slug.startsWith("pg/") || /^\d+$/.test(slug)) continue;
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }

  return counts;
}

function pickBestSlug(counts: Map<string, number>, siteUrl: string): string | null {
  if (!counts.size) return null;

  const base = domainBase(siteUrl);
  const baseNorm = base.replace(/[^a-z0-9]/g, "");

  // Prefer slug that closely matches the domain (e.g. vetyszoo.cz → vetyszoo)
  if (baseNorm.length >= 4) {
    for (const [slug] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      const slugNorm = slug.replace(/[^a-z0-9]/g, "");
      if (slugNorm === baseNorm || slugNorm.startsWith(baseNorm) || baseNorm.startsWith(slugNorm)) {
        return slug;
      }
    }
  }

  // Fall back to most frequent
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// Try to resolve numeric Facebook page ID from the slug (enables view_all_page_id= URL)
async function resolveFbPageId(slug: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.facebook.com/${encodeURIComponent(slug)}`, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Patterns for numeric page ID in Facebook HTML
    const patterns = [
      /fb:\/\/profile\/(\d{8,})/,
      /"page_id":"(\d{8,})"/,
      /"entity_id":"(\d{8,})"/,
      /profile_id=(\d{8,})/,
      /"userID":"(\d{8,})"/,
    ];
    for (const p of patterns) {
      const m = html.match(p);
      if (m) return m[1];
    }
  } catch { /* Facebook blocked or timed out — use slug fallback */ }
  return null;
}

function buildMetaUrl(pageName: string | null, pageId: string | null): string | null {
  const base = "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=CZ&is_targeted_country=false&media_type=all";
  if (pageId) return `${base}&search_type=page&view_all_page_id=${pageId}`;
  if (pageName) return `${base}&search_type=page&q=${encodeURIComponent(pageName)}`;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const empty = new Response(JSON.stringify({ meta_url: null, page_name: null }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  try {
    const { url } = await req.json().catch(() => ({}));
    if (!url) return empty;

    // 1. Fetch website HTML
    let html = "";
    try {
      const res = await fetch(String(url), {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return empty;
      html = await res.text();
    } catch { return empty; }

    // 2. Check for numeric profile ID
    const numericMatch = html.match(/facebook\.com\/profile\.php\?id=(\d{8,})/);
    if (numericMatch) {
      const pageId = numericMatch[1];
      return new Response(JSON.stringify({ meta_url: buildMetaUrl(null, pageId), page_name: pageId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Extract slug candidates and pick best
    const counts = extractFbSlugs(html);
    const pageName = pickBestSlug(counts, String(url));
    if (!pageName) return empty;

    // 4. Try to get numeric page ID for a precise Ads Library URL
    const pageId = await resolveFbPageId(pageName);

    const metaUrl = buildMetaUrl(pageId ? null : pageName, pageId);

    return new Response(JSON.stringify({ meta_url: metaUrl, page_name: pageName }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("discover-meta-url error:", e);
    return empty;
  }
});
