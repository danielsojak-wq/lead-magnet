import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const AI_URL   = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const AI_MODEL = "gemini-2.5-flash";

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}
function ok(d: unknown) {
  return new Response(JSON.stringify(d), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function err(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ─── AI helper ───────────────────────────────────────────────────────────────

function extractJson(text: string): unknown {
  // Strip possible markdown code fences
  const stripped = text.replace(/```(?:json)?/g, "").replace(/```/g, "").trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object in AI response");
  return JSON.parse(match[0]);
}

async function callAI(apiKey: string, system: string, user: string, maxTokens = 8000): Promise<unknown> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(AI_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: AI_MODEL,
          max_tokens: maxTokens,
          temperature: 0.3,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (res.status === 429) {
        const wait = (attempt + 1) * 15000;
        console.warn(`callAI rate limited, waiting ${wait}ms (attempt ${attempt + 1})`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`AI HTTP ${res.status}: ${await res.text()}`);
      const d = await res.json();
      const content: string = d?.choices?.[0]?.message?.content ?? "";
      return extractJson(content);
    } catch (e) {
      console.error(`callAI attempt ${attempt + 1} failed:`, e);
      if (attempt === 3) throw e;
    }
  }
}

// ─── Filters ─────────────────────────────────────────────────────────────────

function filterAds(ads: any[]): any[] {
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  return ads
    .filter(a => a.is_active !== false && (!a.ad_start_date || a.ad_start_date <= cutoff))
    .slice(0, 50);
}

function adMixFromAds(ads: any[]): { brand: number; sales: number; retargeting: number } {
  const counts = { brand: 0, sales: 0, retargeting: 0 };
  for (const a of ads) {
    if (a.ad_type === "brand" || a.ad_type === "sales" || a.ad_type === "retargeting") {
      counts[a.ad_type as keyof typeof counts]++;
    }
  }
  const total = counts.brand + counts.sales + counts.retargeting;
  if (!total) return counts;
  return {
    brand: Math.round(counts.brand / total * 100),
    sales: Math.round(counts.sales / total * 100),
    retargeting: Math.round(counts.retargeting / total * 100),
  };
}

// ─── Prompt builders ─────────────────────────────────────────────────────────

const L1_SYSTEM = `Jsi senior marketingový stratég. Analyzuj reklamní data níže a vrať POUZE validní JSON bez markdown bloků ani backtickú. Pole vyplň reálnými hodnotami na základě dat.`;

function l1User(playerName: string, playerUrl: string, ads: any[]): string {
  const adRows = ads.slice(0, 30).map(a => ({
    text: (a.primary_text || "").slice(0, 200),
    type: a.ad_type || null,
    source: a.ad_source || "meta",
    active: a.is_active,
    started: a.ad_start_date || null,
  }));
  const playerData = { name: playerName, url: playerUrl, total_ads: ads.length, ads: adRows };

  return `DATA HRÁČE: ${JSON.stringify(playerData)}

Vrať JSON v přesně tomto formátu:
{
  "reklamni_mix": {
    "meta": { "single_image": 0, "carousel": 0, "video": 0, "stories": 0 },
    "google": { "search": 0, "display": 0, "video": 0, "pmax": 0 }
  },
  "aktivita": {
    "pocet_aktivnich_reklam": 0,
    "prumerna_delka_behu_dni": 0,
    "frekvence_novych_reklam": "stredni"
  },
  "messaging": {
    "hlavni_claim": "",
    "dominantni_emocni_apel": "logika",
    "funnel_faze": "mix",
    "osloveni": "tykani",
    "pouziva_emoji": false,
    "socialni_dukaz": []
  },
  "kreativni_vzorce": {
    "nejcastejsi_hook": "statement",
    "prumerna_delka_textu": "stredni",
    "top_reklama": { "popis": "", "proc_funguje": "" }
  },
  "landing_pages": {
    "typ": "mix",
    "testuje_ab": false,
    "pouziva_slevy": false
  }
}`;
}

const L2_SYSTEM = `Jsi senior marketingový stratég. Na základě L1 analýz 3 hráčů vrať syntézu. POUZE validní JSON bez markdown bloků ani backtickú.`;

function l2User(eshop: unknown, compA: unknown, compB: unknown): string {
  return `ZADAVATEL: ${JSON.stringify(eshop)}
KONKURENT_A: ${JSON.stringify(compA)}
KONKURENT_B: ${JSON.stringify(compB ?? {})}

Vrať JSON v přesně tomto formátu (min. 2 položky v každém poli):
{
  "category_truths": [
    { "vzorec": "", "vysvetleni": "" }
  ],
  "co_funguje_vsem": [
    { "insight": "", "detail": "" }
  ],
  "mezery_prilezitosti": [
    { "prilezitost": "", "potencial": "vysoky", "zduvodneni": "" }
  ],
  "pozice_zadavatele": {
    "silne_stranky": [""],
    "slabe_stranky": [""],
    "radar": {
      "objem_reklam": 5,
      "kreativni_diverzita": 5,
      "messaging_jasnost": 5,
      "brand_konzistence": 5,
      "funnel_pokryti": 5
    }
  },
  "quick_wins": [
    { "akce": "", "proc": "", "obtiznost": "jednoduche" }
  ]
}`;
}

// ─── Markdown formatters (keep legacy text fields populated) ─────────────────

function l1ToMarkdown(a: any): string {
  const lines: string[] = [];
  if (a?.messaging?.hlavni_claim) {
    lines.push(`### Positioning\n- **Hlavní claim:** ${a.messaging.hlavni_claim}\n- **Emocionální apel:** ${a.messaging.dominantni_emocni_apel}\n- **Funnel fáze:** ${a.messaging.funnel_faze}`);
  }
  if (a?.aktivita) {
    lines.push(`### Aktivita\n- **${a.aktivita.pocet_aktivnich_reklam}** aktivních reklam\n- Průměrná délka běhu: **${a.aktivita.prumerna_delka_behu_dni} dní**\n- Frekvence nových reklam: ${a.aktivita.frekvence_novych_reklam}`);
  }
  if (a?.kreativni_vzorce?.top_reklama?.popis) {
    lines.push(`### Top reklama\n- **${a.kreativni_vzorce.top_reklama.popis}**\n- ${a.kreativni_vzorce.top_reklama.proc_funguje}`);
  }
  if (a?.kreativni_vzorce) {
    lines.push(`### Kreativní vzorce\n- Nejčastější hook: **${a.kreativni_vzorce.nejcastejsi_hook}**\n- Délka textů: ${a.kreativni_vzorce.prumerna_delka_textu}`);
  }
  return lines.join("\n\n");
}

function l2ToMarkdown(l: any): string {
  const lines: string[] = [];
  if (l?.category_truths?.length) {
    lines.push("### Co platí pro celý segment");
    for (const t of l.category_truths) lines.push(`- **${t.vzorec}** — ${t.vysvetleni}`);
  }
  if (l?.co_funguje_vsem?.length) {
    lines.push("### Co funguje všem");
    for (const t of l.co_funguje_vsem) lines.push(`- **${t.insight}** — ${t.detail}`);
  }
  if (l?.mezery_prilezitosti?.length) {
    lines.push("### Mezery a příležitosti");
    for (const m of l.mezery_prilezitosti) lines.push(`- **${m.prilezitost}** (potenciál: ${m.potencial}) — ${m.zduvodneni}`);
  }
  return lines.join("\n\n");
}

// ─── Core analysis logic (exported so start-lm-analysis can import) ──────────

export async function runAnalysis(sessionId: string, apiKey: string): Promise<void> {
  const supa = admin();

  // Mark all competitors as processing
  await supa
    .from("lm_session_competitors")
    .update({ status: "processing" })
    .eq("session_id", sessionId);

  // Load session
  const { data: session, error: sessErr } = await supa
    .from("lm_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (sessErr || !session) throw new Error(`Session ${sessionId} not found`);

  // Load competitors
  const { data: competitors } = await supa
    .from("lm_session_competitors")
    .select("*")
    .eq("session_id", sessionId)
    .order("position");

  const comps = competitors ?? [];

  // Load all ads grouped by competitor
  const { data: allAds } = await supa
    .from("lm_session_ads")
    .select("*")
    .eq("session_id", sessionId);

  const adsMap = new Map<string, any[]>();
  for (const ad of allAds ?? []) {
    const list = adsMap.get(ad.competitor_id) ?? [];
    list.push(ad);
    adsMap.set(ad.competitor_id, list);
  }

  // Prepare ads per competitor (filtered)
  const compAdsFiltered = comps.map(c => filterAds(adsMap.get(c.id) ?? []));

  // L1: sequential with small stagger to avoid parallel rate-limit collisions
  const eshopAds: any[] = [];
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

  const eshopL1 = await callAI(apiKey, L1_SYSTEM, l1User(session.eshop_name || session.eshop_url || "Váš e-shop", session.eshop_url || "", eshopAds));
  const compL1s: (unknown | null)[] = [];
  for (let i = 0; i < comps.length; i++) {
    await delay(3000);
    const result = await callAI(apiKey, L1_SYSTEM, l1User(comps[i].name || comps[i].url, comps[i].url, compAdsFiltered[i]))
      .catch(e => { console.error(`L1 failed for competitor ${comps[i].id}:`, e); return null; });
    compL1s.push(result);
  }

  // Save L1 results per competitor
  await Promise.all(comps.map(async (c, i) => {
    const analysis = compL1s[i];
    const ads = adsMap.get(c.id) ?? [];
    const adMix = adMixFromAds(ads);
    await supa
      .from("lm_session_competitors")
      .update({
        ai_analysis: analysis ?? null,
        status: analysis ? "ready" : "failed",
        ads_count: ads.length,
        ad_mix: adMix,
        summary: analysis ? l1ToMarkdown(analysis) : null,
      })
      .eq("id", c.id);
  }));

  // L2: synthesis (needs all L1 results)
  const l2 = await callAI(apiKey, L2_SYSTEM, l2User(eshopL1, compL1s[0] ?? {}, compL1s[1] ?? {}), 8000)
    .catch(e => { console.error("L2 failed:", e); return null; });

  // Save session result
  await supa
    .from("lm_sessions")
    .update({
      ai_cross_analysis: l2 ?? null,
      cross_summary: l2 ? l2ToMarkdown(l2) : null,
      status: "ready",
      completed_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
}

// ─── Edge Function handler ────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const sessionId = body.session_id as string | undefined;
    if (!sessionId) return err("session_id required");

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return err("GEMINI_API_KEY not configured", 500);

    // Run analysis in background — return 202 immediately so poll-lm-pipeline isn't blocked
    const task = runAnalysis(sessionId, apiKey).catch(async (e) => {
      console.error("analyze-lm-session background error:", e);
      const supa = admin();
      await supa.from("lm_sessions").update({
        status: "failed",
        error_message: String(e),
      }).eq("id", sessionId);
    });
    (globalThis as any).EdgeRuntime?.waitUntil?.(task);

    return ok({ ok: true });
  } catch (e) {
    console.error("analyze-lm-session error:", e);
    return err((e as Error).message, 500);
  }
});
