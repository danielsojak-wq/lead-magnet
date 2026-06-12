import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const AI_URL    = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const AI_MODEL  = "gemini-2.5-flash";   // L1 (4 paralelní) + classify — rychlost, vejde se do 150s
const AI_MODEL_L2 = "gemini-2.5-pro";   // L2 syntéza — jediný call, senior kvalita insightů/quick-wins

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

const RETRY_DELAYS = [2000, 5000, 10000];   // callAI: 3 pokusy, max ~17s čekání — vejde se do 150s budgetu i při 429
const AI_TIMEOUT_MS = 40000;                 // callAI: per-request strop, ať hangující Gemini call nesežere celý budget
                                             // (40s — největší L1 prompt potřebuje víc; 4 paralelní L1 + L2 se i tak vejdou do 150s)

async function callAI(apiKey: string, system: string, user: string, maxTokens = 8000, model = AI_MODEL, timeoutMs = AI_TIMEOUT_MS): Promise<unknown> {
  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
    const isLast = attempt === RETRY_DELAYS.length - 1;
    try {
      const res = await fetch(AI_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature: 0.3,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 429) {
        // Poslední pokus na 429 → throw (ne tiché čekání), ať caller uloží 'failed'
        // a self-heal to dožene v čerstvém budgetu místo hangu do finalize.
        if (isLast) throw new Error("AI rate limited — out of retries");
        console.warn(`callAI rate limited, waiting ${RETRY_DELAYS[attempt]}ms (attempt ${attempt + 1})`);
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
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
      if (isLast) throw e;
      await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
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

// Deterministický per-ad ad_type (bez API) — garantuje UI pills i bez AI classify.
// Pořadí: katalogový placeholder (legacy řádky) → retargeting → sales → brand default.
// Definice DRŽET KONZISTENTNÍ s AI promptem v classifyAds (sales = konkrétní produkt
// + benefit/varianty/nabídka; brand = čistý awareness/edukace bez produktového pushe).
function localAdType(ad: any): "brand" | "sales" | "retargeting" {
  const t = String(ad?.primary_text || "").toLowerCase();
  // Legacy katalogovka s nerenderovaným placeholderem ({{product.brand}}) — nové
  // parsování už placeholder neukládá, ale starší řádky ho mít můžou → akvizice.
  if (/\{\{[^{}]*\}\}/.test(t)) return "sales";
  if (/košík|nezapomeň|nedokončen|vraťte se|stále (čeká|máte)|čeká na vás|dokonči|zapomněl/.test(t)) return "retargeting";
  if (
    // nabídka / cena / nákupní CTA
    /sleva|výprodej|akční|akce |%|\bkč\b|zdarma|koupit|kupte|pořiďte|objednej|objednávejte|nakup|ušetř|jen za|black friday|doprava zdarma|\bkód\b|\bcen(a|u|y|ě|ou)\b/.test(t) ||
    // produktové signály: vyzkoušení produktu, novinky, varianty/odstíny, dostupnost.
    // Záměrně BEZ "objevte" — pálí i na čisté awareness ("objevte umění péče");
    // měkkou produktovou copy bez keywordů doklasifikuje AI refine (classifyAds).
    /vyzkoušej|novink|skladem|odstín|variant|balení|kolekce|edice/.test(t)
  ) return "sales";
  return "brand";
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
  // Refine pass — klasifikuj všechny reklamy s textem a PŘEPIŠ heuristik AI typem.
  // Heuristik už dal každé reklamě baseline ad_type (pills existují), takže když tahle
  // best-effort pasáž pod throttlingem proběhne jen částečně, nic se nerozbije.
  const { data: ads } = await supa
    .from("lm_session_ads")
    .select("id, primary_text")
    .eq("session_id", sessionId)
    .not("primary_text", "is", null);
  if (!ads?.length) return;
  console.log(`classifyAds (refine): ${ads.length} ads in session ${sessionId}`);

  const BATCH = 5;        // reklam na 1 Gemini call
  const CONCURRENCY = 5;  // max paralelních callů (pojistka proti Gemini rate-limitu)

  // Rozsekej na nezávislé batche (každý klasifikuje vlastních max 5 reklam)
  const batches: Array<Array<{ id: string; primary_text: string | null }>> = [];
  for (let i = 0; i < ads.length; i += BATCH) batches.push(ads.slice(i, i + BATCH) as any);

  // Jeden batch: výsledky se přiřazují per-batch (results[idx] → batch[idx].id),
  // takže paralelizace mezi batchi NEovlivní správnost přiřazení.
  const classifyBatch = async (batch: Array<{ id: string; primary_text: string | null }>): Promise<void> => {
    for (let attempt = 0; attempt < 2; attempt++) {   // 1 retry na 429/transient místo tichého zahození
      try {
        const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gemini-2.5-flash",
            max_tokens: 200,
            messages: [
              // Definice DRŽET KONZISTENTNÍ s localAdType — AI refine nesmí systematicky
              // protiřečit heuristice na jasných případech (nabídky, košík, čistý awareness).
              { role: "system", content: `Jsi klasifikátor Meta reklam pro konkurenční analýzu českých e-shopů. Každou reklamu zařaď do právě jedné kategorie:

ROZHODOVACÍ TEST (proveď ho první): Pojmenovává reklama KONKRÉTNÍ produkt (vlastní název produktu, např. BalanceCream, IntenseCream, korektor Závoj, fluid Nádech) A popisuje, co ten produkt dělá nebo komu pomáhá? Pokud ANO → je to sales, BEZ OHLEDU na měkkou, wellness či příběhovou tonalitu okolo. Fráze jako „respektuje ženské tělo" nebo „pro novou fázi života" jsou obal, NE důvod pro brand.

sales (akvizice) — reklama prodává konkrétní produkt nebo kategorii: pojmenovaný produkt + jeho benefit/funkce/použití, varianty či odstíny, cena, sleva, nabídka, výzva koupit/vyzkoušet/objevit produkt. Patří sem i měkká produktová copy bez ceny a CTA.
  • „Korektory Závoj umí zázraky. Nejen, že hezky kryjí a jemně sjednocují…" → sales
  • „Krémový korektor Závoj, 5 odstínů, zakrývá kruhy" → sales
  • „Pleť v rovnováze během cyklu. BalanceCream reaguje na hormonální změny a pomáhá pleti zůstat v rovnováze. Chytrý anti-aging, který respektuje ženské tělo." → sales (pojmenovaný produkt BalanceCream + jeho funkce; wellness tonalita nerozhoduje)
  • Texty katalogových karet (název produktu + popis + varianty) → sales

brand — čistý awareness, edukace, hodnoty nebo příběh ZNAČKY, který NEpojmenovává konkrétní produkt: mluví o značce, jejích hodnotách nebo kategorii obecně.
  • „Krása, která dává smysl. Funkční, čistá a vědomá kosmetika." → brand (žádný konkrétní produkt, jen hodnota značky)
  • „Dnes začíná jaro. Vaše pleť má šanci začít znovu…" → brand (edukace/sezóna bez konkrétního produktu)
  POZOR: brand je JEN tehdy, když chybí konkrétní pojmenovaný produkt. Jakmile reklama jmenuje produkt a říká, co dělá, je to sales — i kdyby zněla jako příběh nebo manifest.

retargeting — připomenutí: návrat ke košíku či prohlíženému zboží, dokončení nákupu („Váš košík na vás čeká", „Nezapomněli jste na něco?").

Zavolej classify_batch s výsledkem pro každou reklamu v pořadí.` },
              { role: "user", content: batch.map((ad, idx) => `--- Reklama ${idx + 1} ---\nText: ${(ad.primary_text || "—").slice(0, 500)}`).join("\n") },
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
          signal: AbortSignal.timeout(15000),
        });
        if (res.status === 429 && attempt === 0) { await new Promise(r => setTimeout(r, 3000)); continue; }
        if (!res.ok) { console.warn(`classifyAds batch HTTP ${res.status}`); return; }
        const d = await res.json();
        const args = d?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
        if (!args) return;
        const results: { ad_type: string }[] = JSON.parse(args)?.results ?? [];
        await Promise.all(batch.map(async (ad, idx) => {
          const t = results[idx]?.ad_type;
          if (t === "brand" || t === "sales" || t === "retargeting") {
            await supa.from("lm_session_ads").update({ ad_type: t }).eq("id", ad.id);
          }
        }));
        return;
      } catch (e) {
        if (attempt === 0) { await new Promise(r => setTimeout(r, 1500)); continue; }
        console.error("classifyAds batch error:", e);
        return;
      }
    }
  };

  // Zpracuj batche ve vlnách po CONCURRENCY paralelně (ne všechny naráz)
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    await Promise.all(batches.slice(i, i + CONCURRENCY).map(classifyBatch));
  }
  console.log(`classifyAds: done`);
}

// ─── Prompt builders ─────────────────────────────────────────────────────────

const DATA_GUARDRAILS = `ZAKÁZANÁ TVRZENÍ — pro tato data NEMÁME zdroj, jejich uvedení je halucinace (stejně závažná jako smyšlený údaj):
- PLACEMENT/UMÍSTĚNÍ: nikdy netvrď ani nedoporučuj stories, reels, feed, in-stream apod. Z Ads Library nevíme, kde se reklama zobrazuje.
- ROZPOČET/SPEND/INVESTICE: nikdy. Scrapeme jen počty a typy reklam, žádné % rozpočtu ani alokaci.
- CÍLENÍ/AUDIENCE/DEMOGRAFIKA: nikdy. Nemáme.
- VÝSLEDKY/VÝKON: nikdy nezmiňuj ROI, konverze, CTR, dosah (reach) ani frekvenci zobrazení. Měříme jen počet reklam a dobu běhu.
- LANDING PAGES konkurenta a A/B TESTY: nikdy netvrď, že někdo testuje/netestuje landing pages ani jaký má typ LP.
- GOOGLE ADS: nikdy (analyzujeme výhradně Meta).
- POZOROVÁNÍ, NE SOUD O STRATEGII: piš o tom, co je VIDĚT v aktivních reklamách, ne o domněnkách o celkové strategii. "V aktivních reklamách jsme nezachytili retargetingové sdělení" ANO; "konkurent nedělá retargeting" NE — nemusí být v Ads Library vidět.`;

const L1_SYSTEM = `Jsi senior marketingový stratég specializující se na digitální reklamu.
Analyzuj reklamní data a vrať POUZE validní JSON bez markdown bloků ani backtickú.

PRAVIDLA:
- Vyplňuj POUZE na základě konkrétních dat z reklam — žádné dohady
- Pokud je k dispozici méně než 5 reklam, nastav messaging.hlavni_claim na "Nedostatek dat pro spolehlivou analýzu" a buď konzervativní u všech odhadů
- top_reklama.popis a proc_funguje musí vycházet z konkrétní reklamy z dat — pokud taková není, napiš "Bez dat"
- aktivita.pocet_aktivnich_reklam vyplň přesně dle dat (počet kde is_active=true)
- Analyzuj VÝHRADNĚ Meta reklamy — máme data pouze z Meta Ads Library. V poli reklamni_mix.google vyplň všechna čísla nulami.
- reklamni_mix.meta: POČÍTEJ PŘESNĚ z pole "format" každé reklamy v datech. "video" → přičti k video, "carousel" → přičti k carousel, "single_image" → přičti k single_image, "catalog" → přičti k catalog. Nikdy neodhaduj ani nedoplňuj formát, který v datech není. Čísla jsou absolutní počty reklam, ne procenta.
- messaging.tema_komunikace: Jedno krátké téma komunikace v max. 10 slovech (např. "Outdoorové vybavení pro náročné turisty"), vycházej výhradně z reklam a landing page dat
- messaging.strategie_uctu: 1-2 věty senior stratéga popisující JAK účet přemýšlí o Meta reklamě. ODVOZUJ VÝHRADNĚ Z CHOVÁNÍ V DATECH: mix formátů (kolik video/carousel/single_image/catalog), mix ad_type (kolik brand/sales/retargeting), frekvence nových reklam, délka rotace, přítomnost slev. Pojmenuj strategii ostře a konkrétně. Příklady: "Brand-first launch: 70 % video, žádný retargeting, žádné slevy, dlouhá rotace." / "Výkonnostní akvizice přes katalog: většina katalogových a single image reklam, slevy v každé druhé reklamě, krátká rotace pod 30 dní." NESMÍ citovat copy z reklam, parafrázovat USP ani fabulovat motivy bez datové opory.
- Nikdy nevymýšlej strategie, claimy ani vzorce bez datové opory
- ENUM POLE — používej VÝHRADNĚ tyto hodnoty (přesně tyto řetězce, lowercase bez diakritiky):
  • dominantni_emocni_apel: logika | touha | strach | humor | komunita | duvera
  • funnel_faze: awareness | consideration | conversion | mix
  • osloveni: tykani | vykani
  • nejcastejsi_hook: otazka | statistika | tvrzeni | pribeh | problem_reseni | socialni_dukaz
  • prumerna_delka_textu: kratky | stredni | dlouhy
  • frekvence_novych_reklam: vysoka | stredni | nizka

${DATA_GUARDRAILS}`;

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
    "meta": { "single_image": 0, "carousel": 0, "video": 0, "catalog": 0 },
    "google": { "search": 0, "display": 0, "video": 0, "pmax": 0 }
  },
  "aktivita": {
    "pocet_aktivnich_reklam": 0,
    "prumerna_delka_behu_dni": 0,
    "frekvence_novych_reklam": "stredni"
  },
  "messaging": {
    "strategie_uctu": "",
    "hlavni_claim": "",
    "tema_komunikace": "",
    "dominantni_emocni_apel": "logika",
    "funnel_faze": "mix",
    "osloveni": "tykani",
    "pouziva_emoji": false,
    "socialni_dukaz": []
  },
  "kreativni_vzorce": {
    "nejcastejsi_hook": "tvrzeni",
    "prumerna_delka_textu": "stredni",
    "top_reklama": { "popis": "", "proc_funguje": "" }
  },
  "landing_pages": {
    "pouziva_slevy": false
  }
}`;
}

const L2_SYSTEM = `Jsi senior growth/performance stratég, který e-commerce zakladateli prezentuje konkurenční analýzu Meta reklam. Mluvíš ostře, konkrétně a bez vaty — každá věta nese informaci, kterou by laik z dat sám nevyčetl. Žádné obecné marketingové fráze. Na základě L1 analýz hráčů vrať syntézu. POUZE validní JSON bez markdown bloků.

PRAVIDLA PRO KVALITU INSIGHTŮ:
- KAŽDÉ číslo musí pocházet z dat, která REÁLNĚ máme (počet reklam podle typu/formátu, doba běhu). NIKDY si nevymýšlej procenta, násobky ani metriky výkonu. Senior stratég radši řekne méně, ale pravdivě — nepředstírá data, která nemá.
- category_truths: Konkrétní OPAKUJÍCÍ SE vzorce z dat — ne obecné marketingové pravdy. Vzor musí být viditelný u zadavatele nebo alespoň jednoho konkurenta.
- co_funguje_vsem: Co konkrétního (formát, hook, délka, emoce) mají společné — s příklady z dat
- mezery_prilezitosti: Konkrétní téma, formát nebo typ sdělení, který v aktivních reklamách nikdo nepoužívá — přímá obchodní příležitost. Smí čerpat JEN ze scrapovaných dimenzí: formát (single_image/carousel/video/catalog), typ sdělení (brand/sales/retargeting), téma/claim, doba běhu, kreativní přístup, sociální důkaz v copy. NIKDY mezeru nestav na placementu, rozpočtu, cílení, výsledcích ani landing pages.
- quick_wins: Každá akce musí být specifická a přímo vycházet z pozorování v reklamách, ne generická rada. Smí doporučovat JEN změny v dimenzích, které reálně vidíme (formát, typ sdělení, téma, hook, doba běhu/rotace, sociální důkaz v copy). NIKDY nedoporučuj placement (stories/reels/feed), rozpočet, cílení, ani „otestujte landing page".
- Pokud data jsou slabá nebo chybí, zdůvodnění musí explicitně uvést "data chybí — doporučení vychází z obecných vzorců segmentu"
- Vždy uveď aspoň 2 položky v každém poli
- V textech VŽDY používej skutečné názvy — hodnotu z ADVERTISER_NAME pro zadavatele, doménu ze závorek pro každého konkurenta. NIKDY nepoužívej slova "zadavatel", "Hráč 1", "HRÁČ_1" ani jiná zástupná označení
- NIKDY nezmiňuj procenta rozpočtu, alokaci investic ani % výdajů. Místo toho vždy uváděj počty reklam: "X z Y reklam jsou retargetingové povahy"
- POČTY REKLAM MUSÍ BÝT JEDNOZNAČNÉ: každý počet vždy ukotvi k typu/formátu a k celku — např. "14 z 50 reklam je carousel". NIKDY nepiš holý počet v závorce za jménem hráče (např. "vikio.cz (14 reklam)") — čtenář by si ho spletl s celkovým počtem reklam hráče, který je uveden v jeho sekci. Číslo za jménem hráče smí být jen celkový počet z hodnoty "X reklam" v jeho HRÁČ_ řádku, nic jiného.
- quick_wins.obtiznost musí být správně klasifikována: "jednoduche" = lze udělat do 1 týdne bez velkých zdrojů; "stredni" = vyžaduje 1–2 týdny a koordinaci; "komplexni" = strategická změna vyžadující měsíc+. POVINNĚ musí být zastoupena aspoň 1 "jednoduche" a 1 "komplexni" obtiznost

${DATA_GUARDRAILS}`;

function domainName(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function l2User(advertiserName: string, eshop: unknown, competitors: Array<{ name: string; l1: unknown; adsCount: number }>): string {
  const totalAds = competitors.reduce((s, c) => s + c.adsCount, 0);
  const dataWarning = totalAds < 5
    ? "\n\nUPOZORNĚNÍ: Málo reklamních dat. Kde chybí, explicitně uveď v zdůvodnění \"data chybí — odhad vychází z obecných vzorců\". Přesto poskytni konkrétní doporučení."
    : "";
  const competitorLines = competitors.map((c, i) =>
    `HRÁČ_${i + 1} (${c.name}, ${c.adsCount} reklam): ${JSON.stringify(c.l1)}`
  ).join("\n");
  return `ADVERTISER_NAME: "${advertiserName}"
ZADAVATEL_DATA: ${JSON.stringify(eshop)}
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

// ─── Ecomail sync ────────────────────────────────────────────────────────────

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://analyza.performind.cz";

async function syncToEcomail(
  sessionId: string,
  email: string,
  eshopUrl: string,
  allComps: Array<{ position: number; url: string }>,
): Promise<void> {
  const apiKey = Deno.env.get("ECOMAIL_API_KEY");
  if (!apiKey) {
    console.log(JSON.stringify({ level: "warn", message: "ecomail_skip", reason: "ECOMAIL_API_KEY not set", session_id: sessionId }));
    return;
  }

  const comp1 = allComps.find(c => c.position === 1);
  const comp2 = allComps.find(c => c.position === 2);

  const payload = {
    subscriber_data: {
      email,
      custom_fields: {
        lm_analysis_analyzed_domain: domainName(eshopUrl),
        lm_analysis_results_url: `${SITE_URL}/results/${sessionId}`,
        lm_analysis_competitor_1: comp1 ? domainName(comp1.url) : "",
        lm_analysis_competitor_2: comp2 ? domainName(comp2.url) : "",
      },
      tags: ["lead-magnet-analyza", "nurtured"],
    },
    trigger_autoresponders: true,
    update_existing: true,
    resubscribe: false,
  };

  const res = await fetch("https://api2.ecomailapp.cz/lists/1/subscribe", {
    method: "POST",
    headers: { "key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.log(JSON.stringify({ level: "error", message: "ecomail_sync_failed", session_id: sessionId, status: res.status, detail: detail.slice(0, 200) }));
  } else {
    const masked = email.slice(0, 2) + "***" + email.slice(email.indexOf("@"));
    console.log(JSON.stringify({ level: "info", message: "ecomail_sync_ok", session_id: sessionId, email_masked: masked }));
  }
}

// ─── Core analysis logic (exported so start-lm-analysis can import) ──────────

// finalize=true: fallback po vyčerpání recovery pokusů — nedokončeným hráčům
// už NEspouštět L1 (mohla by zas hangnout 150s), označit je "bez dat" a rovnou
// dotáhnout L2 + status=ready. Částečná analýza > věčný stuck.
export async function runAnalysis(sessionId: string, apiKey: string, finalize = false): Promise<void> {
  const supa = admin();
  if (finalize) console.warn(`runAnalysis: FINALIZE mode for ${sessionId} — skipping L1 of unfinished players`);

  // Mark all competitors as processing
  await supa.from("lm_session_competitors").update({ status: "processing" }).eq("session_id", sessionId);

  // Load session + competitors in parallel
  const [{ data: session, error: sessErr }, { data: competitors }] = await Promise.all([
    supa.from("lm_sessions").select("*").eq("id", sessionId).single(),
    supa.from("lm_session_competitors").select("*").eq("session_id", sessionId).order("position"),
  ]);
  if (sessErr || !session) throw new Error(`Session ${sessionId} not found`);

  const allComps = competitors ?? [];
  const eshopComp = allComps.find((c: any) => c.position === 0);
  const comps = allComps.filter((c: any) => c.position > 0);

  // Landing page fetche pro L1 web kontext. classifyAds ZÁMĚRNĚ NENÍ tady —
  // přesunuta až ZA L1/L2 (best-effort), ať neukrade Gemini rate-limit budget
  // důležitým voláním (L1 si ad_mix odhaduje sám, ad_type je jen UI kosmetika).
  const allUrls = [session.eshop_url || "", ...comps.map((c: any) => c.url)];
  const webResults = await Promise.all(
    allUrls.map(url => url ? fetchWebsiteContent(url) : Promise.resolve({ content: "", rawTitle: "" })),
  );
  const eshopWeb = webResults[0].content;
  const compWebs = webResults.slice(1).map(r => r.content);
  console.log(`${allUrls.length} landing pages done`);

  // Načti reklamy. Per-ad ad_type GARANTUJ heuristikou (instant, bez API) → UI pills
  // VŽDY existují; AI classify na konci je best-effort upřesní. L1 dostane typy místo null.
  const { data: classifiedAds } = await supa.from("lm_session_ads").select("*").eq("session_id", sessionId);
  const needType = (classifiedAds ?? []).filter((a: any) => !a.ad_type);
  if (needType.length) {
    const byType: Record<string, string[]> = { brand: [], sales: [], retargeting: [] };
    for (const a of needType) { const t = localAdType(a); a.ad_type = t; byType[t].push(a.id); }
    await Promise.all(Object.entries(byType).filter(([, ids]) => ids.length).map(([t, ids]) =>
      supa.from("lm_session_ads").update({ ad_type: t }).in("id", ids)));
    console.log(`heuristic ad_type: ${needType.length} reklam`);
  }
  const classifiedMap = new Map<string, any[]>();
  for (const ad of classifiedAds ?? []) {
    const list = classifiedMap.get(ad.competitor_id) ?? [];
    list.push(ad);
    classifiedMap.set(ad.competitor_id, list);
  }

  // Guard: if there are no ads with real content, fail instead of hallucinating
  const meaningfulAds = (classifiedAds ?? []).filter(a => a.primary_text || a.image_url);
  if (meaningfulAds.length === 0) {
    console.error(`Session ${sessionId}: 0 meaningful ads — aborting analysis`);
    await supa.from("lm_sessions").update({
      status: "failed",
      error_message: "no_ads_scraped",
    }).eq("id", sessionId);
    return;
  }

  const compAdsFiltered = comps.map((c: any) => filterAds(classifiedMap.get(c.id) ?? []));
  const eshopAds: any[] = eshopComp ? filterAds(classifiedMap.get(eshopComp.id) ?? []) : [];

  // Auto-fill eshop_name
  if (!session.eshop_name && webResults[0].rawTitle) {
    const detectedName = extractShopName(webResults[0].rawTitle, session.eshop_url || "");
    if (detectedName) {
      await supa.from("lm_sessions").update({ eshop_name: detectedName }).eq("id", sessionId);
      session.eshop_name = detectedName;
      console.log(`Auto-detected eshop name: ${detectedName}`);
    }
  }

  const saveL1 = async (id: string, analysis: unknown, ads: any[], errorMsg?: string) => {
    const l1AdMix = (analysis as any)?.ad_mix_pct;
    const adMix = (l1AdMix && typeof l1AdMix.brand === "number")
      ? { brand: l1AdMix.brand, sales: l1AdMix.sales, retargeting: l1AdMix.retargeting }
      : adMixFromAds(ads);
    if (errorMsg) console.error(`saveL1 error for ${id}: ${errorMsg}`);
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

  // ── Parallel L1 calls — all players at once ───────────────────────────────
  // Display/AI name je VŽDY normalizovaná doména (ne eshop_name/page_name slogan).
  const eshopName = domainName(session.eshop_url || "") || "Váš e-shop";

  const runEshopL1 = eshopComp
    ? ((eshopComp as any).ai_analysis
        ? (async () => { await supa.from("lm_session_competitors").update({ status: "ready" }).eq("id", eshopComp.id); return (eshopComp as any).ai_analysis; })()
        : finalize
          ? (async () => { await saveL1(eshopComp.id, null, eshopAds, "finalize_skip"); return null; })()
          : callAI(apiKey, L1_SYSTEM, l1User(eshopName, session.eshop_url || "", eshopAds, eshopWeb))
              .then(async r => { if (r) await saveL1(eshopComp.id, r, eshopAds); return r; })
              .catch(async e => { await saveL1(eshopComp.id, null, eshopAds, String(e)); return null; }))
    : Promise.resolve(null);

  const runCompL1s = comps.map((c: any, i: number) =>
    (c as any).ai_analysis
      ? (async () => { await supa.from("lm_session_competitors").update({ status: "ready" }).eq("id", c.id); return (c as any).ai_analysis; })()
      : finalize
        ? (async () => { await saveL1(c.id, null, classifiedMap.get(c.id) ?? [], "finalize_skip"); return null; })()
        : callAI(apiKey, L1_SYSTEM, l1User(domainName(c.url), c.url, compAdsFiltered[i], compWebs[i]))
            .then(async r => { if (r) await saveL1(c.id, r, classifiedMap.get(c.id) ?? []); return r; })
            .catch(async e => { await saveL1(c.id, null, classifiedMap.get(c.id) ?? [], String(e)); return null; })
  );

  console.log(`L1: firing ${1 + comps.length} calls in parallel`);
  let [eshopL1, ...compL1s] = await Promise.all([runEshopL1, ...runCompL1s]);
  console.log(`L1: all done`);

  // ── In-invocation L1 retry — padlé hráče zkus znovu (classify už o budget nesoupeří) ──
  // Resilience proti transientnímu Gemini 429: úspěch přepíše 'failed' → 'ready'.
  if (!finalize) {
    const retries: Promise<void>[] = [];
    if (eshopComp && eshopL1 === null) {
      retries.push((async () => {
        await new Promise(r => setTimeout(r, 1500));
        const r = await callAI(apiKey, L1_SYSTEM, l1User(eshopName, session.eshop_url || "", eshopAds, eshopWeb)).catch(() => null);
        if (r) { await saveL1(eshopComp.id, r, eshopAds); eshopL1 = r; }
      })());
    }
    comps.forEach((c: any, i: number) => {
      if (compL1s[i] === null && !(c as any).ai_analysis) {
        retries.push((async () => {
          await new Promise(r => setTimeout(r, 1500));
          const r = await callAI(apiKey, L1_SYSTEM, l1User(domainName(c.url), c.url, compAdsFiltered[i], compWebs[i])).catch(() => null);
          if (r) { await saveL1(c.id, r, classifiedMap.get(c.id) ?? []); compL1s[i] = r; }
        })());
      }
    });
    if (retries.length) {
      console.log(`L1 retry: ${retries.length} padlý/ch hráč/ů`);
      await Promise.all(retries);
    }
  }

  // ── L2 synthesis ─────────────────────────────────────────────────────────
  console.log("L2: cross-analysis synthesis");
  const compsForL2 = comps.map((c: any, i: number) => ({
    name: domainName(c.url),
    l1: compL1s[i] ?? {},
    adsCount: compAdsFiltered[i]?.length ?? 0,
  }));
  const advertiserName = eshopName;
  // L2 jede na Pro (senior kvalita) s delším timeoutem — jediný call, L1 už doběhly.
  let l2 = await callAI(apiKey, L2_SYSTEM, l2User(advertiserName, eshopL1, compsForL2), 8000, AI_MODEL_L2, 60000)
    .catch(e => { console.error("L2 (Pro) failed:", e); return null; });
  // L2 retry na Flash — rychlejší fallback, ať Pro timeout/throttle nenechá zaseklou
  // „Syntéza se generuje…" (cross_summary=null).
  if (!l2 && !finalize) {
    await new Promise(r => setTimeout(r, 2000));
    l2 = await callAI(apiKey, L2_SYSTEM, l2User(advertiserName, eshopL1, compsForL2), 8000).catch(() => null);
  }

  await supa.from("lm_sessions").update({
    ai_cross_analysis: l2 ?? null,
    cross_summary: l2 ? l2ToMarkdown(l2) : null,
    status: "ready",
    completed_at: new Date().toISOString(),
  }).eq("id", sessionId);

  // Fire-and-forget — must never block or fail the pipeline
  syncToEcomail(sessionId, session.email ?? "", session.eshop_url ?? "", allComps).catch((e: unknown) => {
    console.log(JSON.stringify({ level: "error", message: "ecomail_sync_error", session_id: sessionId, error: String(e) }));
  });

  // classifyAds AŽ TEĎ (best-effort) — per-ad ad_type pills pro UI. Běží ZA status=ready
  // i ecomailem, takže ani když ji throttling sebere, dashboard je kompletní a nurturing
  // odešel. Jádro (L1 ad_mix + L2) na classify nezávisí.
  await classifyAds(apiKey, supa, sessionId).catch((e: unknown) => console.error("classifyAds (best-effort) failed:", String(e)));
}

// ─── Edge Function handler ────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const sessionId = body.session_id as string | undefined;
    const finalize = body.finalize === true;
    if (!sessionId) return err("session_id required");

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return err("GEMINI_API_KEY not configured", 500);

    // Run analysis in background — return 202 immediately so poll-lm-pipeline isn't blocked
    const task = runAnalysis(sessionId, apiKey, finalize).catch(async (e) => {
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
