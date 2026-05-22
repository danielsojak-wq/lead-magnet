import { corsHeaders } from "../_shared/cors.ts";

const EXCLUDED = new Set([
  "sharer", "share", "plugins", "tr", "events", "groups", "dialog",
  "login", "home.php", "video.php", "photo.php", "ads", "business",
  "help", "l", "n", "hashtag", "privacy", "policies", "terms",
  "about", "legal", "settings", "watches", "gaming", "marketplace",
  "fundraisers", "bookmarks", "saved", "people", "stories",
]);

function extractFbPage(html: string): { pageName: string | null; pageId: string | null } {
  // 1. profile.php?id=NUMERIC_ID
  const numericMatch = html.match(/facebook\.com\/profile\.php\?id=(\d{8,})/);
  if (numericMatch) return { pageName: null, pageId: numericMatch[1] };

  // 2. Collect all /pageslug hrefs (exclude known non-page paths)
  const hrefRe = /(?:href|content)=["']https?:\/\/(?:www\.)?facebook\.com\/([a-zA-Z0-9._-]{3,60})\/?(?:[?"']|$)/g;
  const counts = new Map<string, number>();
  let m;
  while ((m = hrefRe.exec(html)) !== null) {
    const slug = m[1].toLowerCase();
    if (!EXCLUDED.has(slug) && !slug.startsWith("pg/") && !/^\d+$/.test(slug)) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }

  if (!counts.size) return { pageName: null, pageId: null };

  // Return most-frequent slug (footer/header links appear multiple times → likely official page)
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
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Performind-Bot/1.0)" },
        signal: AbortSignal.timeout(8000),
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
