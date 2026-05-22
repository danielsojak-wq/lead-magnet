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

// ─── Domain helpers ────────────────────────────────────────────────────────────

function parseDomain(url: string): { host: string; base: string } {
  try {
    const host = new URL(url).hostname.replace(/^www\./, ""); // e.g. vetyszoo.cz
    const base = host.replace(/\.[^.]+$/, "");               // e.g. vetyszoo
    return { host, base };
  } catch { return { host: "", base: "" }; }
}

// Generate slug candidates to try on Facebook (ordered by likelihood)
function slugCandidates(siteUrl: string, htmlSlugs: string[]): string[] {
  const { host, base } = parseDomain(siteUrl);
  const seen = new Set<string>();
  const result: string[] = [];

  const push = (s: string) => {
    const n = s.toLowerCase().trim();
    if (n && !seen.has(n)) { seen.add(n); result.push(n); }
  };

  // Domain-based: most Czech e-shops use domain as FB slug
  push(base);           // vetyszoo
  push(host);           // vetyszoo.cz
  push(base.replace(/-/g, ""));        // remove hyphens

  // Slugs found in website HTML (lower priority — may be legal entity page)
  for (const s of htmlSlugs) push(s);

  return result.filter(s => s.length >= 3);
}

// ─── HTML slug extraction ──────────────────────────────────────────────────────

function extractFbSlugs(html: string): string[] {
  const counts = new Map<string, number>();

  // JSON-LD sameAs (highest per-entry confidence)
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
          if (!EXCLUDED.has(slug) && !/^\d+$/.test(slug))
            counts.set(slug, (counts.get(slug) ?? 0) + 5);
        }
      }
    } catch { /* skip */ }
  }

  // Broad regex — href, data-href, script vars, protocol-relative
  const fbRe = /(?:https?:)?\/\/(?:www\.)?facebook\.com\/([a-zA-Z0-9._-]{3,60})(?=[/?#"'\s<&\\]|$)/g;
  let m;
  while ((m = fbRe.exec(html)) !== null) {
    const slug = m[1].toLowerCase();
    if (!EXCLUDED.has(slug) && !slug.startsWith("pg/") && !/^\d+$/.test(slug))
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
}

// ─── Facebook page ID resolution ───────────────────────────────────────────────

// Returns { pageId } if we can extract it, or { found: true } if page exists but ID not found
async function probeFbSlug(slug: string): Promise<{ pageId: string | null; found: boolean }> {
  try {
    const res = await fetch(`https://www.facebook.com/${encodeURIComponent(slug)}`, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });

    // 404 = slug doesn't exist
    if (res.status === 404) return { pageId: null, found: false };

    const html = await res.text();

    // If redirected to login — page might exist behind auth wall
    const finalUrl = res.url ?? "";
    if (finalUrl.includes("/login") || html.includes("id=\"loginbutton\"") || html.length < 3000) {
      return { pageId: null, found: false };
    }

    // Try to extract numeric page ID
    const patterns = [
      /fb:\/\/profile\/(\d{8,})/,
      /"page_id":"(\d{8,})"/,
      /"entity_id":"(\d{8,})"/,
      /profile_id=(\d{8,})/,
      /"userID":"(\d{8,})"/,
      /"pageID":"(\d{8,})"/,
    ];
    for (const p of patterns) {
      const pm = html.match(p);
      if (pm) return { pageId: pm[1], found: true };
    }

    return { pageId: null, found: true };
  } catch {
    return { pageId: null, found: false };
  }
}

// ─── Build URL ─────────────────────────────────────────────────────────────────

function buildMetaUrl(pageName: string | null, pageId: string | null): string | null {
  const base = "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=CZ&is_targeted_country=false&media_type=all";
  if (pageId) return `${base}&search_type=page&view_all_page_id=${pageId}`;
  if (pageName) return `${base}&search_type=page&q=${encodeURIComponent(pageName)}`;
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

    // 1. Fetch website HTML (for slug hints)
    let htmlSlugs: string[] = [];
    let htmlNumericId: string | null = null;

    try {
      const res = await fetch(siteUrl, {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const html = await res.text();
        const numericMatch = html.match(/facebook\.com\/profile\.php\?id=(\d{8,})/);
        if (numericMatch) htmlNumericId = numericMatch[1];
        else htmlSlugs = extractFbSlugs(html);
      }
    } catch { /* website unreachable — proceed with domain guesses */ }

    // 2. Shortcut: numeric profile ID found directly in HTML
    if (htmlNumericId) {
      return new Response(JSON.stringify({
        meta_url: buildMetaUrl(null, htmlNumericId),
        page_name: htmlNumericId,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 3. Build ordered candidate list and probe all in parallel
    const candidates = slugCandidates(siteUrl, htmlSlugs);
    if (!candidates.length) return empty;

    const probeResults = await Promise.allSettled(
      candidates.map(slug => probeFbSlug(slug).then(r => ({ slug, ...r })))
    );

    // 4. Pick best: prefer result with page ID, then result where page was found
    let bestSlug: string | null = null;
    let bestPageId: string | null = null;

    for (const r of probeResults) {
      if (r.status !== "fulfilled") continue;
      const { slug, pageId, found } = r.value;
      if (pageId) { bestSlug = slug; bestPageId = pageId; break; }
      if (found && !bestSlug) bestSlug = slug;
    }

    // 5. If no FB probe succeeded, fall back to top HTML slug
    if (!bestSlug && htmlSlugs.length) bestSlug = htmlSlugs[0];
    if (!bestSlug) return empty;

    return new Response(JSON.stringify({
      meta_url: buildMetaUrl(bestPageId ? null : bestSlug, bestPageId),
      page_name: bestSlug,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("discover-meta-url error:", e);
    return empty;
  }
});
