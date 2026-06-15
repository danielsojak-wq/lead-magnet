import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function domainName(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

// Legacy řádky z doby před parse fixem můžou nést {{product.brand}} placeholdery
// z katalogových reklam — do UI nesmí nikdy odejít. Placeholder uvnitř delšího
// textu se odstraní; placeholder-only → text null + is_catalog pro fallback label.
const PLACEHOLDER_RE = /\{\{[^{}]*\}\}/g;

function sanitizeAdText(v: unknown): { text: string | null; hadPlaceholder: boolean } {
  if (typeof v !== "string") return { text: null, hadPlaceholder: false };
  const hadPlaceholder = /\{\{[^{}]*\}\}/.test(v);
  const cleaned = v
    .replace(PLACEHOLDER_RE, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  return { text: /[\p{L}\p{N}]/u.test(cleaned) ? cleaned : null, hadPlaceholder };
}

// ── Veřejné demo / case study ────────────────────────────────────────────────
// Reálná scrapovaná data v DB zůstávají NEDOTČENÁ. Anonymizace se aplikuje jen
// tady při čtení (nedestruktivní, vratné) a VÝHRADNĚ pro sessions vyjmenované
// níže — jakákoli jiná session prochází beze změny. Pro veřejnou ukázku se
// nahrazují: zobrazená jména hráčů, odkazy (vypnuté), reálné domény v AI próze
// i v textech reklam. Kreativy (obrázky/videa) zakrývá blur až ve frontendu.
type DemoReplacement = { re: RegExp; to: string };
type DemoConfig = {
  eshopLabel: string;
  competitorLabels: Record<number, string>;
  replacements: DemoReplacement[];
};

const DEMO_SESSIONS: Record<string, DemoConfig> = {
  // Klára Rott (zadavatel) vs deNatura vs Saloos → plně anonymizováno
  "3f4368f5-ce62-41ce-a966-06b71b499f54": {
    eshopLabel: "Váš e-shop",
    competitorLabels: { 1: "Konkurence 1", 2: "Konkurence 2" },
    replacements: [
      { re: /kl[aá]r\w*[\s-]*rott\w*|klararott(\.cz)?/gi, to: "Váš e-shop" },
      { re: /de[\s-]*natura(\.cz)?/gi, to: "Konkurence 1" },
      { re: /saloos(\s+naturcosmetic)?(\.cz)?/gi, to: "Konkurence 2" },
    ],
  },
};

function scrubText(v: unknown, reps: DemoReplacement[]): string | null {
  if (typeof v !== "string") return null;
  let out = v;
  for (const { re, to } of reps) out = out.replace(re, to);
  return out;
}

// Anonymizace JSON sloupců (ai_analysis, ai_cross_analysis) — stringify →
// replace → parse. Labely nemají speciální znaky, takže re-parse je bezpečný.
function scrubJson<T>(obj: T, reps: DemoReplacement[]): T {
  if (obj == null) return obj;
  try {
    return JSON.parse(scrubText(JSON.stringify(obj), reps) ?? "null") as T;
  } catch {
    return obj;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const sessionId = body.session_id as string | undefined;
    if (!sessionId) return err("session_id required");

    const demo = DEMO_SESSIONS[sessionId];

    const supa = admin();

    const { data: session, error: sessionErr } = await supa
      .from("lm_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionErr) throw sessionErr;
    if (!session) return err("session not found", 404);

    // Not yet ready to show anything meaningful
    if (session.status === "email_pending" || session.status === "urls_pending") {
      return ok({
        status: session.status,
        eshop_name: domainName(session.eshop_url ?? "") || "Váš e-shop",
        competitors: [],
        cross_summary: null,
      });
    }

    const { data: competitors, error: compErr } = await supa
      .from("lm_session_competitors")
      .select("*")
      .eq("session_id", sessionId)
      .order("position");

    if (compErr) throw compErr;

    const competitorIds = (competitors ?? []).map((c: any) => c.id as string);

    const { data: allAds, error: adsErr } = competitorIds.length > 0
      ? await supa
          .from("lm_session_ads")
          .select("*")
          .in("competitor_id", competitorIds)
      : { data: [] as any[], error: null };

    if (adsErr) throw adsErr;

    const adsByCompetitor = new Map<string, any[]>();
    for (const ad of (allAds ?? [])) {
      const list = adsByCompetitor.get(ad.competitor_id) ?? [];
      list.push(ad);
      adsByCompetitor.set(ad.competitor_id, list);
    }

    function mapCompetitor(c: any) {
      const displayName = demo
        ? (c.position === 0 ? demo.eshopLabel : (demo.competitorLabels[c.position] ?? domainName(c.url)))
        : domainName(c.url);
      return {
        id: c.id,
        name: displayName,
        website_url: demo ? null : c.url,
        summary: demo ? scrubText(c.summary, demo.replacements) : (c.summary ?? null),
        ai_analysis: demo ? scrubJson(c.ai_analysis, demo.replacements) : (c.ai_analysis ?? null),
        status: c.status as "ready" | "processing" | "failed" | "empty" | "scrape_failed",
        ads_count: c.ads_count,
        ad_mix: c.ad_mix ?? { brand: 0, sales: 0, retargeting: 0 },
        ads: (adsByCompetitor.get(c.id) ?? []).map((a: any) => {
          const { text, hadPlaceholder } = sanitizeAdText(a.primary_text);
          return {
            id: a.id,
            image_url: a.image_url ?? null,
            video_url: a.video_url ?? null,
            primary_text: demo ? scrubText(text, demo.replacements) : text,
            is_catalog: hadPlaceholder,
            ad_type: a.ad_type ?? null,
            ad_source: a.ad_source as "meta" | "google",
            is_active: a.is_active,
            ad_start_date: a.ad_start_date ?? null,
            format: a.format ?? null,
          };
        }),
      };
    }

    const eshopRow = (competitors ?? []).find((c: any) => c.position === 0);
    const mappedCompetitors = (competitors ?? []).filter((c: any) => c.position > 0).map(mapCompetitor);
    const eshopCompetitor = eshopRow ? mapCompetitor(eshopRow) : null;

    return ok({
      status: session.status as string,
      eshop_name: demo ? demo.eshopLabel : (domainName(session.eshop_url ?? "") || "Váš e-shop"),
      eshop_competitor: eshopCompetitor,
      competitors: mappedCompetitors,
      cross_summary: demo ? scrubText(session.cross_summary, demo.replacements) : (session.cross_summary ?? null),
      ai_cross_analysis: demo ? scrubJson(session.ai_cross_analysis, demo.replacements) : (session.ai_cross_analysis ?? null),
      demo: !!demo,
    });
  } catch (e) {
    console.error(e);
    return err((e as Error).message, 500);
  }
});
