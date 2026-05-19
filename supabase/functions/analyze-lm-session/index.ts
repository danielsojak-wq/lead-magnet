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

const RETRY_DELAYS = [8000, 16000, 32000, 48000];

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
        const wait = RETRY_DELAYS[attempt] ?? 48000;
        console.warn(`callAI rate limited, waiting ${wait}ms (attempt ${attempt + 1})`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`AI HTTP ${res.status}: ${body.slice(0, 300)}`);
      }
      const d = await res.json();
      const content: string = d?.choices?.[0]?.message?.content ?? "";
      return extractJson(content);
    } catch (e) {
      console.error(`callAI attempt ${attempt + 1} failed:`, e);
      if (attempt === 3) throw e;
      await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt] ?? 8000));
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

function computeAvgDuration(ads: any[]): number {
  const today = Date.now();
  const active = (ads as any[]).filter((a: any) => a.ad_start_date && a.is_active);
  const pool   = active.length ? active : (ads as any[]).filter((a: any) => a.ad_start_date);
  if (!pool.length) return 0;
  const days = pool.map((a: any) => Math.max(0, Math.floor((today - new Date(a.ad_start_date).getTime()) / 86400000)));
  return Math.round(days.reduce((s: number, d: number) => s + d, 0) / days.length);
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

// ─── Classify ads ────────────────────────────────────────────────────────────

async function classifyAds(apiKey: string, supa: ReturnType<typeof admin>, sessionId: string): Promise<void> {
  const { data: ads } = await supa
    .from("lm_session_ads")
    .select("id, primary_text")
    .eq("session_id", sessionId)
    .is("ad_type", null);
  if (!ads?.length) return;
  console.log(`classifyAds: ${ads.length} unclassified ads in session ${sessionId}`);

  const BATCH = 5;
  for (let i = 0; i < ads.length; i += BATCH) {
    const batch = ads.slice(i, i + BATCH);
    try {
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          max_tokens: 200,
          messages: [
            { role: "system", content: "Klasifikuj každou reklamu: brand = budování značky; sales = přímá konverze; retargeting = připomenutí. Zavolej classify_batch." },
            { role: "user", content: batch.map((ad: any, idx: number) => `--- Reklama ${idx + 1} ---\nText: ${(ad.primary_text || "—").slice(0, 300)}`).join("\n") },
          ],
          tools: [{
            type: "function",
            function: {
              name: "classify_batch",
              parameters: {
                type: "object",
                properties: {
                  results: {
                    type: "array",
                    items: { type: "object", properties: { ad_type: { type: "string", enum: ["brand", "sales", "retargeting"] } }, required: ["ad_type"] },
                  },
                },
                required: ["results"],
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "classify_batch" } },
        }),
      });
      if (!res.ok) { console.warn(`classifyAds batch ${i} HTTP ${res.status}`); continue; }
      const d = await res.json();
      const args = d?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) continue;
      const results: { ad_type: string }[] = JSON.parse(args)?.results ?? [];
      await Promise.all(batch.map(async (ad: any, idx: number) => {
        const t = results[idx]?.ad_type;
        if (t === "brand" || t === "sales" || t === "retargeting") {
          await supa.from("lm_session_ads").update({ ad_type: t }).eq("id", ad.id);
        }
      }));
      if (i + BATCH < ads.length) await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.error(`classifyAds batch ${i} error:`, e);
    }
  }
  console.log(`classifyAds: done`);
}

// ─── Prompt builders ─────────────────────────────────────────────────────────

const L1_SYSTEM = `Jsi senior marketingový stratég specializující se na digitální reklamu.
Analyzuj reklamní data a vrať POUZE validní JSON bez markdown bloků ani backtickú.

PRAVIDLA:
- Vyplňuj POUZE na základě konkrétních dat z reklam — žádné dohady
- Pokud je k dispozici méně než 5 reklam, nastav messaging.hlavni_claim na "Nedostatek dat pro spolehlivou analýzu" a buď konzervativní u všech odhadů
- top_reklama.popis a proc_funguje musí vycházet z konkrétní reklamy z dat — pokud taková není, napiš "Bez dat"
- aktivita.pocet_aktivnich_reklam vyplň přesně dle dat (počet kde is_active=true)
- Analyzuj VÝHRADNĚ Meta reklamy — máme data pouze z Meta Ads Library. Google Ads data NEMÁME. V poli reklamni_mix.google vyplň všechna čísla nulami.
- reklamni_mix.meta: POČÍTEJ PŘESNĚ z pole "format" každé reklamy v datech. "video" → přičti k video, "carousel" → přičti k carousel, "single_image" → přičti k single_image. Nikdy neodhaduj ani nedoplňuj formát, který v datech není. stories vždy 0. Čísla jsou absolutní počty reklam, ne procenta.
- NIKDY nezmiňuj procenta rozpočtu, alokaci investic ani % výdajů — tato data nemáme. Místo toho vždy uváděj počty reklam: "X z Y reklam jsou retargetingové povahy"
- messaging.tema_komunikace: Jedno krátké téma komunikace v max. 10 slovech (např. "Outdoorové vybavení pro náročné turisty"), vycházej výhradně z reklam a landing page dat
- Nikdy nevymýšlej strategie, claimy ani vzorce bez datové opory`;

function l1User(playerName: string, playerUrl: string, ads: any[], websiteContent = ""): string {
  const adRows = ads.slice(0, 30).map(a => ({
    text: (a.primary_text || "").slice(0, 200),
    type: a.ad_type || null,
    format: a.format || (a.video_url ? "video" : a.image_url ? "single_image" : null),
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
    "tema_komunikace": "",
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
- Vždy uveď aspoň 2 položky v každém poli
- V textech VŽDY používej skutečné názvy hráčů (např. "zajo.com"), NIKDY "Hráč 1", "HRÁČ_1" ani žádné zástupné označení
- Vycházej VÝHRADNĚ z Meta Ads dat. NIKDY nezmiňuj Google Ads, Google kampaně, Google Search ani Display v analýze.
- NIKDY nezmiňuj procenta rozpočtu, alokaci investic ani % výdajů. Místo toho vždy uváděj počty reklam: "X z Y reklam jsou retargetingové povahy"
- quick_wins.obtiznost musí být správně klasifikována: "jednoduche" = lze udělat do 1 týdne bez velkých zdrojů; "stredni" = vyžaduje 1–2 týdny a koordinaci; "komplexni" = strategická změna vyžadující měsíc+. POVINNĚ musí být zastoupena aspoň 1 "jednoduche" a 1 "komplexni" obtiznost`;

function domainName(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function l2User(eshop: unknown, competitors: Array<{ name: string; l1: unknown; adsCount: number }>): string {
  const totalAds = competitors.reduce((s, c) => s + c.adsCount, 0);
  const dataWarning = totalAds < 5
    ? "\n\nUPOZORNĚNÍ: Málo reklamních dat. Kde chybí, explicitně uveď v zdůvodnění \"data chybí — odhad vychází z obecných vzorců\". Přesto poskytni konkrétní doporučení."
    : "";
  const competitorLines = competitors.map((c, i) =>
    `HRÁČ_${i + 1} (${c.name}, ${c.adsCount} reklam): ${JSON.stringify(c.l1)}`
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

  // Classify unclassified ads (brand/sales/retargeting) before L1 so AI gets typed data
  await classifyAds(apiKey, supa, sessionId);

  // Reload ads after classification — adsMap now has correct ad_type and format
  const { data: classifiedAds } = await supa
    .from("lm_session_ads")
    .select("*")
    .eq("session_id", sessionId);
  const classifiedMap = new Map<string, any[]>();
  for (const ad of classifiedAds ?? []) {
    const list = classifiedMap.get(ad.competitor_id) ?? [];
    list.push(ad);
    classifiedMap.set(ad.competitor_id, list);
  }

  // Prepare ads per competitor (filtered)
  const compAdsFiltered = comps.map((c: any) => filterAds(classifiedMap.get(c.id) ?? []));

  // Eshop ads from position 0 row (if scraped)
  const eshopAds: any[] = eshopComp ? filterAds(classifiedMap.get(eshopComp.id) ?? []) : [];

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

  // Save L1 result immediately after each call — so partial results survive a timeout
  const saveL1 = async (id: string, analysis: unknown, ads: any[], errorMsg?: string) => {
    const l1AdMix = (analysis as any)?.ad_mix_pct;
    const adMix = (l1AdMix && typeof l1AdMix.brand === "number")
      ? { brand: l1AdMix.brand, sales: l1AdMix.sales, retargeting: l1AdMix.retargeting }
      : adMixFromAds(ads);
    if (errorMsg) console.error(`saveL1 error for ${id}: ${errorMsg}`);
    // AI doesn't know today's date — always compute duration from real data
    if (analysis && (analysis as any).aktivita) {
      (analysis as any).aktivita.prumerna_delka_behu_dni = computeAvgDuration(ads);
    }
    await supa.from("lm_session_competitors").update({
      ai_analysis: analysis ?? null,
      status: analysis ? "ready" : "failed",
      ads_count: ads.length,
      ad_mix: adMix,
      summary: analysis ? l1ToMarkdown(analysis) : null,
    }).eq("id", id);
  };

  // ── Sequential L1 calls with 2 s gap — avoids simultaneous rate-limit hits ──
  // Skip competitors already marked "ready" — reuse saved ai_analysis for L2

  // Eshop (position 0)
  let eshopL1: unknown = null;
  if (eshopComp) {
    if ((eshopComp as any).ai_analysis) {
      console.log(`L1: skip eshop (already has analysis)`);
      eshopL1 = (eshopComp as any).ai_analysis;
      await supa.from("lm_session_competitors").update({ status: "ready" }).eq("id", eshopComp.id);
    } else {
      console.log(`L1: eshop (${eshopAds.length} ads)`);
      eshopL1 = await callAI(apiKey, L1_SYSTEM, l1User(session.eshop_name || session.eshop_url || "Váš e-shop", session.eshop_url || "", eshopAds, eshopWeb))
        .catch(async (e) => {
          console.error("L1 failed for eshop:", e);
          await saveL1(eshopComp.id, null, eshopAds, String(e));
          return null;
        });
      if (eshopL1) await saveL1(eshopComp.id, eshopL1, eshopAds);
      if (comps.length > 0) await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Competitors (position 1+) — one by one
  const compL1s: unknown[] = [];
  for (let i = 0; i < comps.length; i++) {
    const c = comps[i] as any;
    if (c.ai_analysis) {
      console.log(`L1: skip ${c.url} (already has analysis)`);
      compL1s.push(c.ai_analysis);
      await supa.from("lm_session_competitors").update({ status: "ready" }).eq("id", c.id);
      continue;
    }
    console.log(`L1: competitor ${i + 1}/${comps.length} — ${c.url} (${compAdsFiltered[i].length} ads)`);
    const result = await callAI(apiKey, L1_SYSTEM, l1User(c.name || c.url, c.url, compAdsFiltered[i], compWebs[i]))
      .catch(async (e) => {
        console.error(`L1 failed for competitor ${c.id}:`, e);
        await saveL1(c.id, null, classifiedMap.get(c.id) ?? [], String(e));
        return null;
      });
    compL1s.push(result);
    if (result) await saveL1(c.id, result, classifiedMap.get(c.id) ?? []);
    if (i < comps.length - 1) await new Promise(r => setTimeout(r, 2000));
  }

  // L2: synthesis — wait 2 s after last L1 before firing
  await new Promise(r => setTimeout(r, 2000));
  console.log("L2: cross-analysis synthesis");
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
