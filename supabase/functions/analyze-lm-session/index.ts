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
        const wait = (attempt + 1) * 5000;
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

// ─── Website scraper ─────────────────────────────────────────────────────────

async function fetchWebsiteContent(url: string): Promise<{ content: string; rawTitle: string }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Performind-Bot/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { content: "", rawTitle: "" };
    const html = await res.text();

    const rawTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
    const desc  = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,300})/i)?.[1]?.trim()
               ?? html.match(/<meta[^>]+content=["']([^"']{0,300})["'][^>]+name=["']description["']/i)?.[1]?.trim()
               ?? "";
    const headings = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
      .map(m => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 12)
      .join(" | ");
    const bodyText = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2500);

    const content = [
      rawTitle ? `Titulek: ${rawTitle}` : "",
      desc     ? `Meta popis: ${desc}` : "",
      headings ? `Nadpisy: ${headings}` : "",
      bodyText ? `Obsah stránky: ${bodyText}` : "",
    ].filter(Boolean).join("\n");

    return { content, rawTitle };
  } catch (e) {
    console.warn(`fetchWebsiteContent failed for ${url}:`, e);
    return { content: "", rawTitle: "" };
  }
}

function extractShopName(rawTitle: string, fallbackUrl: string): string | null {
  if (!rawTitle) return null;
  // "Rebiom – přírodní doplňky" → "Rebiom"
  // "Úvod | Symprove CZ" → "Symprove CZ"
  const name = rawTitle.split(/[\|\–\-—]/)[0].trim();
  if (name.length < 2 || name.length > 40) return null;
  return name;
}

// ─── Filters ─────────────────────────────────────────────────────────────────

function filterAds(ads: any[]): any[] {
  // Sort active first, then by start date descending — include all ads for analysis
  return [...ads]
    .sort((a, b) => {
      if (a.is_active && !b.is_active) return -1;
      if (!a.is_active && b.is_active) return 1;
      return (b.ad_start_date ?? "").localeCompare(a.ad_start_date ?? "");
    })
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

const L1_SYSTEM = `Jsi senior marketingový stratég specializující se na digitální reklamu.
Analyzuj reklamní data a vrať POUZE validní JSON bez markdown bloků ani backtickú.

PRAVIDLA:
- Vyplňuj POUZE na základě konkrétních dat z reklam — žádné dohady
- Pokud je k dispozici méně než 5 reklam, nastav messaging.hlavni_claim na "Nedostatek dat pro spolehlivou analýzu" a buď konzervativní u všech odhadů
- top_reklama.popis a proc_funguje musí vycházet z konkrétní reklamy z dat — pokud taková není, napiš "Bez dat"
- aktivita.pocet_aktivnich_reklam vyplň přesně dle dat (počet kde is_active=true)
- Nikdy nevymýšlej strategie, claimy ani vzorce bez datové opory`;

function l1User(playerName: string, playerUrl: string, ads: any[], websiteContent = ""): string {
  const adRows = ads.slice(0, 30).map(a => ({
    text: (a.primary_text || "").slice(0, 200),
    type: a.ad_type || null,
    source: a.ad_source || "meta",
    active: a.is_active,
    started: a.ad_start_date || null,
  }));
  const playerData = { name: playerName, url: playerUrl, total_ads: ads.length, ads: adRows };
  const dataNote = ads.length === 0
    ? "\n\nUPOZORNĚNÍ: Nemáme žádná reklamní data pro tohoto hráče. Vyplň JSON konzervativními hodnotami (hodnoty 0 tam kde jsou čísla), messaging.hlavni_claim = \"Data nejsou k dispozici\", top_reklama.popis = \"Bez dat\"."
    : ads.length < 5
    ? `\n\nPOZNÁMKA: Málo dat (${ads.length} reklam). Buď konzervativní, analytické závěry opři výhradně o dostupné záznamy.`
    : "";
  const webNote = websiteContent
    ? `\n\nLANDING PAGE DATA (použij pro lepší pochopení positioning a messaging):\n${websiteContent.slice(0, 2500)}`
    : "";

  return `DATA HRÁČE: ${JSON.stringify(playerData)}${dataNote}${webNote}

Vrať JSON v přesně tomto formátu (ad_mix_pct: odhadni % rozdělení reklam na brand/sales/retargeting, součet = 100):
{
  "ad_mix_pct": { "brand": 0, "sales": 0, "retargeting": 0 },
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

const L2_SYSTEM = `Jsi senior marketingový stratég. Na základě L1 analýz hráčů vrať syntézu. POUZE validní JSON bez markdown bloků.

PRAVIDLA PRO KVALITU INSIGHTŮ:
- category_truths: Konkrétní OPAKUJÍCÍ SE vzorce z dat — ne obecné marketingové pravdy. Vzor musí být viditelný u zadavatele nebo alespoň jednoho konkurenta.
- co_funguje_vsem: Co konkrétního (formát, hook, délka, emoce) mají společné — s příklady z dat
- mezery_prilezitosti: Konkrétní témata, formáty nebo segmenty, které NIKDO nepoužívá — přímé obchodní příležitosti
- quick_wins: Každá akce musí být specifická a přímo vycházet z analýzy, ne generické rady
- Pokud data jsou slabá nebo chybí, zdůvodnění musí explicitně uvést "data chybí — doporučení vychází z obecných vzorců segmentu"
- Vždy uveď aspoň 2 položky v každém poli`;

function domainName(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function l2User(eshop: unknown, competitors: Array<{ name: string; l1: unknown; adsCount: number }>): string {
  const totalAds = competitors.reduce((s, c) => s + c.adsCount, 0);
  const dataWarning = totalAds < 5
    ? "\n\nUPOZORNĚNÍ: Málo reklamních dat. Kde chybí, explicitně uveď v zdůvodnění \"data chybí — odhad vychází z obecných vzorců\". Přesto poskytni konkrétní doporučení."
    : "";
  const competitorLines = competitors.map((c, i) =>
    `KONKURENT_${String.fromCharCode(65 + i)} — ${c.name} (${c.adsCount} reklam): ${JSON.stringify(c.l1)}`
  ).join("\n");
  return `ZADAVATEL: ${JSON.stringify(eshop)}
${competitorLines}${dataWarning}

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

  // Mark real competitors (position > 0) as processing
  await supa
    .from("lm_session_competitors")
    .update({ status: "processing" })
    .eq("session_id", sessionId)
    .gt("position", 0);

  // Load session
  const { data: session, error: sessErr } = await supa
    .from("lm_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (sessErr || !session) throw new Error(`Session ${sessionId} not found`);

  // Load competitors — position 0 = eshop, position 1+ = real competitors
  const { data: competitors } = await supa
    .from("lm_session_competitors")
    .select("*")
    .eq("session_id", sessionId)
    .order("position");

  const allComps = competitors ?? [];
  const eshopComp = allComps.find((c: any) => c.position === 0);
  const comps = allComps.filter((c: any) => c.position > 0);

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
  const compAdsFiltered = comps.map((c: any) => filterAds(adsMap.get(c.id) ?? []));

  // Eshop ads from position 0 row (if scraped)
  const eshopAds: any[] = eshopComp ? filterAds(adsMap.get(eshopComp.id) ?? []) : [];

  // Fetch landing pages in parallel (before AI calls)
  const allUrls = [session.eshop_url || "", ...comps.map((c: any) => c.url)];
  const webResults = await Promise.all(allUrls.map(url => url ? fetchWebsiteContent(url) : Promise.resolve({ content: "", rawTitle: "" })));
  const eshopWeb = webResults[0].content;
  const compWebs = webResults.slice(1).map(r => r.content);
  console.log(`Fetched ${allUrls.length} landing pages`);

  // Auto-fill eshop_name from page title if not set
  if (!session.eshop_name && webResults[0].rawTitle) {
    const detectedName = extractShopName(webResults[0].rawTitle, session.eshop_url || "");
    if (detectedName) {
      await supa.from("lm_sessions").update({ eshop_name: detectedName }).eq("id", sessionId);
      session.eshop_name = detectedName;
      console.log(`Auto-detected eshop name: ${detectedName}`);
    }
  }

  const l1Results = await Promise.all([
    callAI(apiKey, L1_SYSTEM, l1User(session.eshop_name || session.eshop_url || "Váš e-shop", session.eshop_url || "", eshopAds, eshopWeb))
      .catch(e => { console.error("L1 failed for eshop:", e); return null; }),
    ...comps.map((c: any, i: number) =>
      callAI(apiKey, L1_SYSTEM, l1User(c.name || c.url, c.url, compAdsFiltered[i], compWebs[i]))
        .catch(e => { console.error(`L1 failed for competitor ${c.id}:`, e); return null; })
    ),
  ]);
  const eshopL1 = l1Results[0];
  const compL1s = l1Results.slice(1);

  // Save L1 results per competitor (position > 0) and eshop (position 0)
  const saveL1 = async (id: string, analysis: unknown, ads: any[]) => {
    const l1AdMix = (analysis as any)?.ad_mix_pct;
    const adMix = (l1AdMix && typeof l1AdMix.brand === "number")
      ? { brand: l1AdMix.brand, sales: l1AdMix.sales, retargeting: l1AdMix.retargeting }
      : adMixFromAds(ads);
    await supa.from("lm_session_competitors").update({
      ai_analysis: analysis ?? null,
      status: analysis ? "ready" : "failed",
      ads_count: ads.length,
      ad_mix: adMix,
      summary: analysis ? l1ToMarkdown(analysis) : null,
    }).eq("id", id);
  };

  await Promise.all([
    ...(eshopComp ? [saveL1(eshopComp.id, eshopL1, eshopAds)] : []),
    ...comps.map((c, i) => saveL1(c.id, compL1s[i], adsMap.get(c.id) ?? [])),
  ]);

  // L2: synthesis (needs all L1 results)
  const compsForL2 = comps.map((c: any, i: number) => ({
    name: c.name || domainName(c.url),
    l1: compL1s[i] ?? {},
    adsCount: compAdsFiltered[i]?.length ?? 0,
  }));
  const l2 = await callAI(apiKey, L2_SYSTEM, l2User(eshopL1, compsForL2), 8000)
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
