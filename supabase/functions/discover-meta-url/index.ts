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

function extractFbPage(html: string): { pageName: string | null; pageId: string | null } {
  // 1. Numeric profile ID anywhere in HTML
  const numericMatch = html.match(/facebook\.com\/profile\.php\?id=(\d{8,})/);
  if (numericMatch) return { pageName: null, pageId: numericMatch[1] };

  // 2. JSON-LD sameAs — highest confidence, always server-rendered
  const jsonLdBlocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of jsonLdBlocks) {
    try {
      const obj = JSON.parse(block[1]);
      const sameAs: string[] = Array.isArray(obj?.sameAs) ? obj.sameAs
        : typeof obj?.sameAs === "string" ? [obj.sameAs] : [];
      for (const u of sameAs) {
        const fbM = String(u).match(/(?:https?:)?\/\/(?:www\.)?facebook\.com\/([a-zA-Z0-9._-]{3,60})/);
        if (fbM) {
          const slug = fbM[1].toLowerCase();
          if (!EXCLUDED.has(slug) && !/^\d+$/.test(slug)) return { pageName: slug, pageId: null };
        }
      }
    } catch { /* skip malformed JSON */ }
  }

  // 3. Broad regex — catches href, data-href, og tags, script vars, //protocol-relative
  // Lookahead ensures slug ends at /, ?, #, quote, whitespace, < or &
  const fbRe = /(?:https?:)?\/\/(?:www\.)?facebook\.com\/([a-zA-Z0-9._-]{3,60})(?=[/?#"'\s<&\\]|$)/g;
  const counts = new Map<string, number>();
  let m;
  while ((m = fbRe.exec(html)) !== null) {
    const slug = m[1].toLowerCase();
    if (EXCLUDED.has(slug) || slug.startsWith("pg/") || /^\d+$/.test(slug)) continue;
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }

  if (!counts.size) return { pageName: null, pageId: null };

  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return { pageName: best, pageId: null };
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

    let html = "";
    try {
      const res = await fetch(String(url), {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "cs,en-US;q=0.7,en;q=0.3",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return empty;
      html = await res.text();
    } catch {
      return empty;
    }

    const { pageName, pageId } = extractFbPage(html);
    const metaUrl = buildMetaUrl(pageName, pageId);

    return new Response(JSON.stringify({ meta_url: metaUrl, page_name: pageName ?? pageId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("discover-meta-url error:", e);
    return empty;
  }
});
