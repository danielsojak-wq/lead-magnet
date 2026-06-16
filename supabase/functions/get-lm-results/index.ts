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
  blur: boolean;       // rozmazat kreativy ve frontendu? (řídí frontend přes results.blur)
  source?: string;     // alias: číst data z jiné (reálné) session, ne ze session v URL
};

// Klára Rott (zadavatel) vs deNatura vs Saloos → plně anonymizováno.
// \p{L} (unicode písmeno) + /u kvůli českému skloňování a diakritice:
// "deNatury/deNaturu", "Kláře". \w (ASCII) by tvary jako "deNatury" propustil.
// "Klára"/"Rott" se v datech vyskytují VÝHRADNĚ jako dvouslovné "Klara Rott",
// proto matchujeme jen ten tvar (žádná false-positive na křestní jméno Klára).
const KLARA_DEMO = {
  eshopLabel: "Analyzovaný e-shop",
  competitorLabels: { 1: "Konkurence 1", 2: "Konkurence 2" },
  replacements: [
    { re: /kl[aá]r\p{L}*[\s-]*rott\p{L}*(\.cz)?/giu, to: "Analyzovaný e-shop" },
    { re: /de[\s-]*natur\p{L}*(\.cz)?/giu, to: "Konkurence 1" },
    { re: /saloos\p{L}*(\.cz)?/giu, to: "Konkurence 2" },
    // Cizí osoba (vizážistka z UGC reklam) — @handle řeší DEMO_HANDLE_RE v plain
    // textu, ale AI próza ji zmiňuje jménem bez zavináče → odstranit i ten tvar.
    { re: /asya\s*meytuv[\p{L}_]*\s*/giu, to: "" },
  ],
} as const;

const KLARA_REAL_ID = "3f4368f5-ce62-41ce-a966-06b71b499f54";

// Dvě URL nad STEJNÝMI anonymizovanými daty: s blur (kontrolovaná ukázka) a bez
// blur (plná). No-blur varianta je virtuální session (nemá řádek v DB) a přes
// `source` čte data z reálné Klára Rott session.
const DEMO_SESSIONS: Record<string, DemoConfig> = {
  [KLARA_REAL_ID]: { ...KLARA_DEMO, blur: true },
  "f9f1fb89-0915-45a1-8278-2db5ba7091f5": { ...KLARA_DEMO, blur: false, source: KLARA_REAL_ID },
};

// Odkazy a @handle z textů reklam prozrazují brand (i třetí osoby — influenceři).
// Z PLAIN textu se odstraní úplně. Char class [^\s)"] končí i na uvozovce, aby se
// regex nikdy nerozjel přes hranici (bezpečnostní pojistka, i když plain text žádné
// uvozovky nemá).
const DEMO_URL_RE = /(?:https?:\/\/)?www\.[^\s)"]+/gi; // odkazy s www
const DEMO_BARE_URL_RE = /https?:\/\/[^\s)"]+/gi;       // http(s) bez www
const DEMO_HANDLE_RE = /@[\w.]+/g;                       // @handle (brand i cizí)

function applyReplacements(s: string, reps: DemoReplacement[]): string {
  let out = s;
  for (const { re, to } of reps) out = out.replace(re, to);
  return out;
}

// Plný scrub pro PLAIN text (texty reklam, summary, cross_summary): odkazy a
// @handle pryč úplně, pak brand→label, pak úklid zbylých mezer a mezer před
// interpunkcí po odstranění.
function scrubText(v: unknown, reps: DemoReplacement[]): string | null {
  if (typeof v !== "string") return null;
  let out = v
    .replace(DEMO_URL_RE, "")
    .replace(DEMO_BARE_URL_RE, "")
    .replace(DEMO_HANDLE_RE, "");
  out = applyReplacements(out, reps);
  return out.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.!?:;])/g, "$1").trim();
}

// JSON sloupce (ai_analysis, ai_cross_analysis): POUZE brand→label na stringifiedu.
// Záměrně BEZ URL/handle stripu — greedy URL regex by mohl sežrat uvozovku a rozbít
// JSON (parse fail → tichý návrat originálu = leak). JSON pole navíc odkazy ani
// handle neobsahují (ověřeno proti reálným datům). Labely nemají speciální znaky.
function scrubJson<T>(obj: T, reps: DemoReplacement[]): T {
  if (obj == null) return obj;
  try {
    return JSON.parse(applyReplacements(JSON.stringify(obj), reps)) as T;
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
    // Virtuální demo session (např. no-blur varianta) čte data z reálné session.
    const dataSessionId = demo?.source ?? sessionId;

    const supa = admin();

    const { data: session, error: sessionErr } = await supa
      .from("lm_sessions")
      .select("*")
      .eq("id", dataSessionId)
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
      .eq("session_id", dataSessionId)
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
      blur: demo?.blur ?? false,
    });
  } catch (e) {
    console.error(e);
    return err((e as Error).message, 500);
  }
});
