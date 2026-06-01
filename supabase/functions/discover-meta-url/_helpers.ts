export const EXCLUDED = new Set([
  "sharer", "share", "plugins", "tr", "events", "groups", "dialog",
  "login", "home.php", "video.php", "photo.php", "ads", "business",
  "help", "l", "n", "hashtag", "privacy", "policies", "terms",
  "about", "legal", "settings", "watches", "gaming", "marketplace",
  "fundraisers", "bookmarks", "saved", "people", "stories",
  "pages", "watch", "messages", "search", "photo", "video", "reel",
  "notifications", "live", "story", "reels", "profile",
]);

export function extractFbSlugs(html: string): { sameAsSlugs: string[]; otherSlugs: string[] } {
  const sameAsCounts = new Map<string, number>();
  const otherCounts  = new Map<string, number>();

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
            sameAsCounts.set(slug, (sameAsCounts.get(slug) ?? 0) + 1);
        }
      }
    } catch { /* skip */ }
  }

  const fbRe = /(?:https?:)?\/\/(?:www\.)?facebook\.com\/([a-zA-Z0-9._-]{3,60})(?=[/?#"'\s<&\\]|$)/g;
  let m;
  while ((m = fbRe.exec(html)) !== null) {
    const slug = m[1].toLowerCase();
    if (!EXCLUDED.has(slug) && !slug.startsWith("pg/") && !/^\d+$/.test(slug) && !sameAsCounts.has(slug))
      otherCounts.set(slug, (otherCounts.get(slug) ?? 0) + 1);
  }

  return {
    sameAsSlugs: [...sameAsCounts.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s),
    otherSlugs:  [...otherCounts.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s),
  };
}
