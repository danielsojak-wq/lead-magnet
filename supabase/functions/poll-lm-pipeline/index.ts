import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// ─── Page validation helpers ──────────────────────────────────────────────────

function buildPageUrl(pageId: string): string {
  return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=CZ` +
    `&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=${pageId}`;
}

// q= page-name search (brand fallback). Marker lm_fallback=1 se ukládá jen do DB
// meta_library_url (NE do Apify vstupu) → completion pak ví, že má použít strict
// validaci (brand_exact only, bez containmentu).
function buildQueryUrl(q: string): string {
  return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=CZ` +
    `&is_targeted_country=false&media_type=all&search_type=page&q=${encodeURIComponent(q)}`;
}

function extractDomain(url: string): string | null {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
}

function pageIdFromMetaUrl(metaUrl: string | null | undefined): string | null {
  if (!metaUrl) return null;
  try { return new URL(metaUrl).searchParams.get("view_all_page_id"); } catch { return null; }
}

// Běh vznikl z brand-fallbacku (řeší špatný page_id z discovery shortcutu).
function isFallbackMeta(metaUrl: string | null | undefined): boolean {
  if (!metaUrl) return false;
  try { return new URL(metaUrl).searchParams.has("lm_fallback"); } catch { return false; }
}

function normalizeFbSlug(slug: string): string {
  return slug.trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^(www\.|m\.|web\.)?facebook\.com\//i, "")
    .replace(/^\/+/, "")
    .split(/[/?#]/)[0]
    .trim();
}

// Retry target — priorita page_id > vanity slug > q= (stejně jako start-lm-analysis).
function retryTargetUrl(pageId: string | null, fbSlug: string | null, fallbackMetaUrl: string | null): string | null {
  if (pageId) return buildPageUrl(pageId);
  const slug = fbSlug ? normalizeFbSlug(fbSlug) : "";
  if (slug) return `https://www.facebook.com/${slug}`;
  return fallbackMetaUrl;
}

async function startApifyRun(token: string, actor: string, input: unknown): Promise<string | null> {
  try {
    const res = await fetch(`https://api.apify.com/v2/acts/${actor}/runs?token=${token}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
    });
    if (!res.ok) { console.error("Apify retry start failed:", res.status); return null; }
    const d = await res.json();
    return d?.data?.id ?? null;
  } catch (e) { console.error("Apify retry start error:", e); return null; }
}

const APIFY_META_ACTOR = "curious_coder~facebook-ads-library-scraper";

// Stuck-scraping timeout: Apify run visící v RUNNING déle než tohle → force
// terminace, ať session neuvízne ve `scraping` navždy (case rihamich). Normální
// run (i 73 reklam) doběhne do ~2 min; 4 min = bezpečný práh proti false-positive.
const SCRAPE_STUCK_MS = 240_000;

// Heuristic: page_name looks like a brand if short, no comma, max 3 words
function looksLikeBrand(s: string | null): boolean {
  if (!s) return false;
  return !s.includes(",") && s.trim().split(/\s+/).length <= 3 && s.length <= 25;
}

// Derive display name: use scraped page_name when brand-like, else capitalize SLD
function deriveDisplayName(pageName: string | null, competitorUrl: string): string {
  if (looksLikeBrand(pageName)) return pageName!;
  try {
    const host = new URL(competitorUrl).hostname.replace(/^www\./, "");
    const sld = host.replace(/\.[^.]+$/, ""); // "terasvet.cz" → "terasvet"
    return sld.charAt(0).toUpperCase() + sld.slice(1);
  } catch {
    return pageName ?? competitorUrl;
  }
}

function normStr(s: string): string {
  return s.normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function brandFromUrl(metaUrl: string | null): string | null {
  try { return new URL(metaUrl!).searchParams.get("q"); } catch { return null; }
}

function vanityFromUri(pageProfileUri: string | null | undefined): string | null {
  if (!pageProfileUri) return null;
  try {
    const seg = new URL(pageProfileUri).pathname.replace(/^\//, "").split("/")[0];
    return seg || null;
  } catch {
    return pageProfileUri.replace(/^\//, "").split("/")[0].split("?")[0] || null;
  }
}

type MatchPath = "vanity_exact" | "brand_exact" | "containment";

function pickDominantPage(
  items: any[],
  brandName: string | null,
  fbSlug: string | null,
  opts: { strict?: boolean } = {},
): { filtered: any[]; pageId: string; pageName: string; matchPath: MatchPath } | null {
  const groups: Record<string, { name: string; vanity: string | null; items: any[] }> = {};
  for (const it of items) {
    const pid = String(it?.page_id || it?.snapshot?.page_id || "").replace(/\D/g, "");
    if (!pid) continue;
    const pname = it?.page_name || it?.snapshot?.page_name || "";
    const puri  = it?.snapshot?.page_profile_uri ?? null;
    if (!groups[pid]) groups[pid] = { name: pname, vanity: vanityFromUri(puri), items: [] };
    groups[pid].items.push(it);
  }

  const pick = (pid: string, matchPath: MatchPath) => ({
    filtered: groups[pid].items,
    pageId: pid,
    pageName: groups[pid].name,
    matchPath,
  });

  // Kolo 1: VANITY EXACT — fb_slug ze sameAs/HTML === slug z snapshot.page_profile_uri
  // Guard: vanity_exact wins jen pokud je jediná page ve výsledcích NEBO page_name
  // zároveň brand-matchne. Brání html-source slugu protlačit cizí stránku.
  if (fbSlug) {
    const normFb = normStr(fbSlug);
    const normBrandV = brandName ? normStr(brandName) : null;
    const vanityHits = Object.keys(groups)
      .filter(pid => groups[pid].vanity && normStr(groups[pid].vanity!) === normFb);

    if (vanityHits.length === 1) {
      const pid = vanityHits[0];
      const isOnlyPage = Object.keys(groups).length === 1;
      const pageNameMatches = normBrandV
        ? (() => {
            const np = normStr(groups[pid].name);
            return np === normBrandV ||
              (Math.min(np.length, normBrandV.length) >= 4 &&
               (np.includes(normBrandV) || normBrandV.includes(np)));
          })()
        : false;
      if (isOnlyPage || pageNameMatches) return pick(pid, "vanity_exact");
      // Vanity hit, ale nepotvrzeno brand matchem — propadni do kola 2/3
    }
    if (vanityHits.length > 1) return null;
  }

  if (!brandName) return null;
  const normBrand = normStr(brandName);

  // Kolo 2: BRAND EXACT
  const exactHits = Object.keys(groups)
    .filter(pid => normStr(groups[pid].name) === normBrand);
  if (exactHits.length === 1) return pick(exactHits[0], "brand_exact");
  if (exactHits.length > 1)  return null;

  // strict režim (brand fallback): containment vynech — u keyword searche by
  // substring shoda mohla protlačit cizí stránku. Radši nula než špatná stránka.
  if (opts.strict) return null;

  // Kolo 3: CONTAINMENT (min délka 4, právě 1 kandidát)
  const containHits = Object.keys(groups).filter(pid => {
    const normPage = normStr(groups[pid].name);
    const minLen = Math.min(normPage.length, normBrand.length);
    return minLen >= 4 && (normPage.includes(normBrand) || normBrand.includes(normPage));
  });
  if (containHits.length === 1) return pick(containHits[0], "containment");
  return null;
}

// ─── Text extraction & placeholder sanitization ──────────────────────────────

// Katalogové reklamy (Advantage+ / DCO / DPA) mají v body/title/link_description
// nerenderované placeholdery "{{product.brand}}" — reálná copy je v cards[].
const PLACEHOLDER_RE = /\{\{[^{}]*\}\}/g;

function hasPlaceholder(v: unknown): boolean {
  return typeof v === "string" && /\{\{[^{}]*\}\}/.test(v);
}

// Placeholder uvnitř delšího reálného textu se odstraní; čistý placeholder
// (i vícenásobný "{{a}} {{b}}") → null. Výsledek musí obsahovat písmeno/číslici.
function sanitizeText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const cleaned = v
    .replace(PLACEHOLDER_RE, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  return /[\p{L}\p{N}]/u.test(cleaned) ? cleaned : null;
}

// Caption bývá jen holá doména ("klararott.cz") — ta do copy nepatří.
function looksLikeBareUrl(v: unknown): boolean {
  return typeof v === "string" && /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(v.trim());
}

// Složí composite text ze VŠECH reálných polí: body → title → link_description →
// caption → unikátní karty (title, body, link_description). Dedupe řeší DCO
// duplikáty karet i karty opakující hlavní body. isCatalog = DCO/DPA display
// format NEBO placeholder v raw polích (interní signál, ne nová kategorie).
function buildAdText(snapshot: any, it: any): { text: string | null; isCatalog: boolean } {
  const cards = snapshot?.cards || it?.cards || [];
  const bodyRaw = snapshot?.body?.text ?? (typeof snapshot?.body === "string" ? snapshot.body : null) ?? it?.body?.text;
  const displayFormat = String(snapshot?.display_format ?? it?.display_format ?? "").toLowerCase();
  let isCatalog = displayFormat === "dco" || displayFormat === "dpa";

  const units: string[] = [];
  const seen: string[] = [];
  const push = (v: unknown) => {
    if (hasPlaceholder(v)) isCatalog = true;
    const s = sanitizeText(v);
    if (!s) return;
    const key = s.toLowerCase().replace(/\s+/g, " ");
    // přesný duplikát NEBO text už obsažený v delším přidaném celku → skip
    if (seen.some(k => k === key || k.includes(key))) return;
    seen.push(key);
    units.push(s);
  };

  push(bodyRaw);
  push(snapshot?.title ?? it?.title);
  push(snapshot?.link_description ?? it?.link_description);
  const caption = snapshot?.caption ?? it?.caption;
  if (!looksLikeBareUrl(caption)) push(caption);
  for (const c of cards) {
    push(c?.title);
    push(c?.body?.text ?? (typeof c?.body === "string" ? c.body : null));
    push(c?.link_description);
  }

  // Akční (nákupní) CTA je funnel signál → do textu pro klasifikaci. Generické
  // "Další informace"/LEARN_MORE se ignoruje (nenese akviziční signál).
  const ACTION_CTA_TYPES = new Set([
    "SHOP_NOW", "BUY_NOW", "ORDER_NOW", "GET_OFFER", "ADD_TO_CART",
    "SUBSCRIBE", "SIGN_UP", "BOOK_NOW", "BOOK_TRAVEL", "GET_QUOTE",
  ]);
  const ctaText = snapshot?.cta_text ?? it?.cta_text;
  const ctaType = String(snapshot?.cta_type ?? it?.cta_type ?? "").toUpperCase();
  const isActionCta = ACTION_CTA_TYPES.has(ctaType) ||
    /koupit|objednat|objednej|nakup|do košíku|pořídit|objevit|vyzkoušet|rezervovat|získat/i.test(String(ctaText ?? ""));
  if (isActionCta) push(ctaText);

  const text = units.join("\n").slice(0, 1500).trim() || null;
  return { text, isCatalog };
}

// ─── Ad mappers ───────────────────────────────────────────────────────────────

function mapMetaItem(it: any, sessionId: string, competitorId: string) {
  const snapshot = it?.snapshot || it;
  const toDate = (v: any): string | null => {
    if (!v) return null;
    const n = typeof v === "number" ? v * (v < 1e12 ? 1000 : 1) : Date.parse(v);
    if (!n || isNaN(n)) return null;
    return new Date(n).toISOString().slice(0, 10);
  };
  const images = snapshot?.images || it?.images || [];
  const cards  = snapshot?.cards  || it?.cards  || [];
  const videos = snapshot?.videos || it?.videos || [];
  const cardWithImg = cards.find((c: any) =>
    c.original_image_url || c.originalImageUrl || c.resized_image_url || c.resizedImageUrl
  );
  // Náhled videa (poster) — video reklamy nemají images[], ale snapshot.videos[]
  // nese video_preview_image_url. Použijeme ho jako image_url, ať má i video poster
  // (jinak by zůstal null → po expiraci fbcdn prázdná dlaždice; viz persist-ad-media).
  const videoPoster =
    videos[0]?.video_preview_image_url || videos[0]?.videoPreviewImageUrl ||
    cards.find((c: any) => c.video_preview_image_url || c.videoPreviewImageUrl)?.video_preview_image_url ||
    cards.find((c: any) => c.video_preview_image_url || c.videoPreviewImageUrl)?.videoPreviewImageUrl || null;
  // Preferuj resized (náhled stačí pro dlaždice i lightbox; ~10× menší než originál
  // → levnější Storage). Originál jako fallback, pak poster videa.
  const firstImg =
    images[0]?.resizedImageUrl  || images[0]?.resized_image_url  ||
    images[0]?.originalImageUrl || images[0]?.original_image_url ||
    cardWithImg?.resized_image_url  || cardWithImg?.resizedImageUrl  ||
    cardWithImg?.original_image_url || cardWithImg?.originalImageUrl ||
    videoPoster || null;
  const cardWithVid = cards.find((c: any) =>
    c.video_hd_url || c.videoHdUrl || c.video_sd_url || c.videoSdUrl
  );
  const firstVid =
    videos[0]?.videoHdUrl  || videos[0]?.video_hd_url  ||
    videos[0]?.videoSdUrl  || videos[0]?.video_sd_url  ||
    cardWithVid?.video_hd_url || cardWithVid?.videoHdUrl ||
    cardWithVid?.video_sd_url || cardWithVid?.videoSdUrl || null;
  const { text: adText, isCatalog } = buildAdText(snapshot, it);
  // Formát z display_format (čistý signál) — počet karet je u DCO/DPA zavádějící
  // (produktové varianty z feedu, ne carousel slides). Video má vždy přednost;
  // katalog (DCO/DPA, signál z buildAdText) je vlastní formát "catalog" → badge "Katalog".
  const df = String(snapshot?.display_format ?? it?.display_format ?? "").toUpperCase();
  const adFormat: string =
    videos.length > 0 || !!cardWithVid ? "video" :
    isCatalog                          ? "catalog" :
    df === "CAROUSEL"                  ? "carousel" :
    df === "IMAGE"                     ? "single_image" :
    cards.length > 1                   ? "carousel" : "single_image";  // fallback bez display_format
  return {
    session_id:    sessionId,
    competitor_id: competitorId,
    ad_source:     "meta",
    ad_archive_id: String(it?.ad_archive_id || it?.adArchiveID || it?.id || crypto.randomUUID()),
    image_url:     firstImg,
    video_url:     firstVid,
    format:        adFormat,
    primary_text:  adText ?? sanitizeText(it?.primary_text),
    is_active:     it?.is_active ?? true,
    ad_start_date: toDate(it?.start_date || it?.startDate || snapshot?.creation_time),
    // Deterministicky: katalogovka úplně bez reálného textu → sales (akvizice).
    // Ostatní nechává null — klasifikuje analyze-lm-session (heuristika + AI).
    ad_type:       isCatalog && !adText ? "sales" : null,
    page_id:       String(it?.page_id || snapshot?.page_id || "").replace(/\D/g, "") || null,
    page_name:     it?.page_name || snapshot?.page_name || null,
  };
}

// ─── Download one Apify dataset ───────────────────────────────────────────────

async function downloadApifyDataset(token: string, datasetId: string): Promise<any[]> {
  const res = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&clean=true&format=json`,
  );
  if (!res.ok) return [];
  return await res.json() as any[];
}

async function checkAndProcessRun(
  token: string,
  runId: string,
): Promise<{ done: boolean; succeeded: boolean; datasetId: string; items: any[]; creditExhausted: boolean }> {
  const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`);
  const statusData = await statusRes.json();
  const apifyStatus: string  = statusData?.data?.status ?? "";
  const statusMessage: string = (statusData?.data?.statusMessage ?? "").toLowerCase();
  const datasetId: string    = statusData?.data?.defaultDatasetId ?? "";

  const creditExhausted = statusMessage.includes("maximum charged") || statusMessage.includes("charged results");

  console.log(`Apify run ${runId}: ${apifyStatus} — ${statusData?.data?.statusMessage ?? ""}`);

  if (apifyStatus === "RUNNING" || apifyStatus === "READY" || apifyStatus === "STARTING") {
    return { done: false, succeeded: false, datasetId, items: [], creditExhausted: false };
  }
  if (apifyStatus !== "SUCCEEDED") {
    return { done: true, succeeded: false, datasetId, items: [], creditExhausted };
  }
  const items = await downloadApifyDataset(token, datasetId);
  return { done: true, succeeded: true, datasetId, items, creditExhausted };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const session_id = body.session_id as string | undefined;
    if (!session_id) return err("session_id required");

    const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN");
    if (!APIFY_TOKEN) return err("APIFY_API_TOKEN not configured", 500);

    const supa = admin();

    // Fast-path: check session status
    const { data: session } = await supa
      .from("lm_sessions").select("status, error_message, eshop_name").eq("id", session_id).single();

    if (session?.status === "ready" || session?.status === "completed") {
      // L1 self-heal: hráč nascrapován (ads>0), ale L1 selhala (status=failed)
      // kvůli transientní chybě Gemini → JEDEN re-run v čerstvé invokaci (nový
      // 150s budget + nové AI okno). Idempotentní: úspěšní hráči reuse, padlý se
      // přepočítá. Strop přes l1_retried, ať nevzniká smyčka.
      const { data: full } = await supa.from("lm_sessions").select("l1_retried").eq("id", session_id).single();
      if (full && !full.l1_retried) {
        const { count: failedWithAds } = await supa.from("lm_session_competitors")
          .select("id", { count: "exact", head: true })
          .eq("session_id", session_id).eq("status", "failed").gt("ads_count", 0);
        if ((failedWithAds ?? 0) > 0) {
          // Atomický claim — jen jeden poll vyhraje (status→analyzing, l1_retried=true).
          const { data: claimed } = await supa.from("lm_sessions")
            .update({ status: "analyzing", l1_retried: true, analyzing_started_at: new Date().toISOString() })
            .eq("id", session_id).eq("status", session.status).eq("l1_retried", false)
            .select("id").maybeSingle();
          if (claimed) {
            console.warn(`Session ${session_id} L1 self-heal: re-running ${failedWithAds} failed-L1 player(s)`);
            const analyzeUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/analyze-lm-session`;
            await fetch(analyzeUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
              body: JSON.stringify({ session_id }),
            }).catch(e => console.error("L1 self-heal trigger failed:", e));
            return ok({ status: "analyzing" });
          }
        }
      }
      return ok({ status: "ready" });
    }
    if (session?.status === "failed") return ok({ status: "failed", error_message: session.error_message ?? null });

    // Recovery: session zaseklá v "analyzing" (runAnalysis nedoběhl v 150s).
    // Práh 3 min. ATOMICKÝ CLAIM přes DB funkci → jen jeden souběžný poll vyhraje
    // → brání dvojímu re-triggeru / dvojímu L2 (peníze). Status zůstává 'analyzing',
    // takže žádný jiný poll nepropadne do trigger cesty níže.
    if (session?.status === "analyzing") {
      const STUCK_SECONDS = 180;          // 3 min bez výsledku → recovery
      const MAX_RESTART_ATTEMPTS = 3;     // po 3 restartech → finalize (částečná analýza)
      const ABSOLUTE_MAX = 6;             // tvrdý strop → fail (garantuje terminaci)

      const { data: claimRows } = await supa.rpc("claim_stuck_lm_session", {
        p_session_id: session_id,
        p_stuck_seconds: STUCK_SECONDS,
      });
      const attempts = Array.isArray(claimRows) && claimRows.length > 0
        ? (claimRows[0].attempts as number)
        : null;

      // Nezaseklé (pod prahem) NEBO claim vyhrál jiný poll → nic nedělej.
      if (attempts === null) return ok({ status: "analyzing" });

      // Tvrdý strop — ani finalize nepomohl → ukončit jako failed, ne věčný stuck.
      if (attempts > ABSOLUTE_MAX) {
        console.error(`Session ${session_id} recovery exhausted (${attempts}) → failed`);
        await supa.from("lm_sessions").update({ status: "failed", error_message: "analysis_timeout" }).eq("id", session_id);
        return ok({ status: "failed", error_message: "analysis_timeout" });
      }

      // <= MAX_RESTART_ATTEMPTS: normální re-run (idempotentní — dožene jen
      // nedokončené hráče + L2). Nad strop: finalize (přeskoč stuck L1, vynuť L2).
      const finalize = attempts > MAX_RESTART_ATTEMPTS;
      console.warn(`Session ${session_id} stuck recovery: attempt ${attempts}, finalize=${finalize}`);

      const analyzeUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/analyze-lm-session`;
      await fetch(analyzeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
        body: JSON.stringify({ session_id, finalize }),
      }).catch(e => console.error("recovery analyze trigger failed:", e));

      return ok({ status: "analyzing" });
    }

    // Load all competitors
    const { data: competitors } = await supa
      .from("lm_session_competitors")
      .select("id, position, url, apify_run_id, apify_google_run_id, status, meta_library_url, fb_slug, scrape_retried, scraping_started_at")
      .eq("session_id", session_id);

    const comps = competitors ?? [];

    // Advance "pending" competitors with no Apify run to "scraped" so the pipeline doesn't block forever
    for (const comp of comps.filter(c => c.status === "pending" && !c.apify_run_id)) {
      await supa.from("lm_session_competitors")
        .update({ status: "scraped", ads_count: 0 })
        .eq("id", comp.id);
      comp.status = "scraped";
    }

    // If any competitor is still pending (Apify not yet started), report scraping
    if (comps.some(c => c.status === "pending")) {
      const scraped = comps.filter(c => c.status === "scraped" || c.status === "scrape_failed").length;
      return ok({ status: "scraping", scraped, total: comps.length });
    }

    const scraping = comps.filter(c => c.status === "scraping");

    for (const comp of scraping) {
      let totalAds = 0;
      let scrapeStatus = "scraped";

      // Check Meta run
      if (comp.apify_run_id) {
        const { done, succeeded, items, creditExhausted } = await checkAndProcessRun(APIFY_TOKEN, comp.apify_run_id);
        if (!done) {
          // Hangnutý Apify run (RUNNING nad práh) → force terminace, ať session
          // neuvízne ve `scraping` bez driveru. Bez timestampu (legacy řádek)
          // se chová jako dřív (čeká dál).
          const startedAt = comp.scraping_started_at ? Date.parse(comp.scraping_started_at) : NaN;
          if (!isNaN(startedAt) && Date.now() - startedAt > SCRAPE_STUCK_MS) {
            console.warn(JSON.stringify({ level: "warn", message: "scrape_stuck_force_terminate",
              session_id, competitor_id: comp.id, run_id: comp.apify_run_id,
              age_s: Math.round((Date.now() - startedAt) / 1000) }));
            await supa.from("lm_session_competitors")
              .update({ status: "scrape_failed", ads_count: 0, scrape_retried: true })
              .eq("id", comp.id);
          }
          continue;
        }
        if (creditExhausted) {
          console.error(`Competitor ${comp.id}: Apify credit exhausted`);
          await supa.from("lm_sessions").update({
            status: "failed",
            error_message: "apify_credit_exhausted",
          }).eq("id", session_id);
          return ok({ status: "failed", error_message: "apify_credit_exhausted" });
        }
        if (succeeded) {
          if (items.length) {
            const brandName = brandFromUrl(comp.meta_library_url ?? null);
            const fbSlug    = comp.fb_slug ?? null;
            const strict    = isFallbackMeta(comp.meta_library_url);
            const match = pickDominantPage(items, brandName, fbSlug, { strict });

            if (!match) {
              console.log(JSON.stringify({ level: "warn", message: "page_validation_no_match",
                session_id, competitor_id: comp.id, brand: brandName, fb_slug: fbSlug,
                distinct_pages: [...new Set(items.map((i: any) => i?.page_id))].length }));
            } else {
              const winnerUrl = buildPageUrl(match.pageId);
              const displayName = deriveDisplayName(match.pageName, comp.url);
              const rows = match.filtered.map(it => mapMetaItem(it, session_id, comp.id));
              // Fallback "katalog bez textu → sales" má být VZÁCNÝ — vyšší počet
              // znamená rozbitý parse (texty se nenačetly z cards[]).
              const catalogNoText = rows.filter(r => r.ad_type === "sales" && !r.primary_text).length;
              if (catalogNoText > 0) {
                console.log(JSON.stringify({ level: "warn", message: "catalog_no_text_fallback",
                  session_id, competitor_id: comp.id, count: catalogNoText, total: rows.length }));
              }
              await supa.from("lm_session_ads").upsert(rows, { onConflict: "session_id,ad_archive_id", ignoreDuplicates: false });
              totalAds = rows.length;
              scrapeStatus = "scraped";
              await supa.from("lm_session_competitors")
                .update({ status: scrapeStatus, ads_count: totalAds, meta_library_url: winnerUrl, name: displayName })
                .eq("id", comp.id);
              // Cache doména → page_id, ať příští scrape jde přes canonical URL (bez vanity redirectu)
              const cacheDomain = extractDomain(comp.url);
              if (cacheDomain) {
                await supa.from("lm_page_id_cache")
                  .upsert({ domain: cacheDomain, page_id: match.pageId, page_name: match.pageName, updated_at: new Date().toISOString() }, { onConflict: "domain" })
                  .then(({ error }) => { if (error) console.warn("page_id cache upsert failed:", error.message); });
              }
              console.log(JSON.stringify({ level: "info", message: "page_validated",
                session_id, competitor_id: comp.id, page_id: match.pageId,
                page_name: match.pageName, ads: totalAds, match_path: match.matchPath }));
              continue;
            }
          }
        } else {
          scrapeStatus = "scrape_failed";
          console.warn(`Competitor ${comp.id}: Apify run failed`);
        }
      }

      // Retry-on-empty: 0 reklam + ještě neretryováno → JEDEN retry (chrání první
      // běh bez cache; když mezitím máme page_id, retry přes canonical URL).
      if (totalAds === 0 && !comp.scrape_retried) {
        const domain = extractDomain(comp.url);
        const metaPageId = pageIdFromMetaUrl(comp.meta_library_url);

        // Je page_id už ověřený (prošel pickDominantPage → je v cache)? Pak mu věříme:
        // 0 reklam = stránka reálně neinzeruje, brand fallback NEděláme.
        let cachedPageId: string | null = null;
        if (domain) {
          const { data: cache } = await supa.from("lm_page_id_cache").select("page_id").eq("domain", domain).maybeSingle();
          cachedPageId = (cache?.page_id as string | undefined) ?? null;
        }

        // Brand pro fallback: q= z meta_url, jinak eshop_name (jen pozice 0 — u
        // konkurentů spolehlivý název nemáme, fallback se nespustí).
        const retryBrand = brandFromUrl(comp.meta_library_url ?? null)
          ?? (comp.position === 0 ? (session?.eshop_name ?? null) : null);

        // NEOVĚŘENÝ page_id (z discovery shortcutu profile.php?id, není v cache)
        // + 0 reklam + máme brand → ten page_id je nejspíš špatná FB stránka (web
        // odkazuje jinou page než tu, co inzeruje). Zahoď page_id, hledej podle
        // názvu a nech pickDominantPage (strict) rozhodnout.
        let retried = false;
        if (metaPageId && !cachedPageId && retryBrand) {
          const qUrl = buildQueryUrl(retryBrand);
          const retryRun = await startApifyRun(APIFY_TOKEN, APIFY_META_ACTOR, {
            urls: [{ url: qUrl }], limitPerSource: 50, "scrapePageAds.activeStatus": "active",
          });
          if (retryRun) {
            // meta_library_url přepíšeme na q= URL (+ marker lm_fallback) → completion
            // má brand pro pickDominantPage a ví, že má validovat strict.
            await supa.from("lm_session_competitors")
              .update({ apify_run_id: retryRun, status: "scraping", scrape_retried: true,
                        scraping_started_at: new Date().toISOString(),
                        meta_library_url: `${qUrl}&lm_fallback=1` })
              .eq("id", comp.id);
            console.log(JSON.stringify({ level: "info", message: "scrape_retry",
              session_id, competitor_id: comp.id, via: "brand_fallback", dropped_page_id: metaPageId }));
            retried = true;
          }
        } else {
          // Původní chování: page_id (cache/meta) > vanity > q=, retry na stejný cíl.
          const pageId = metaPageId ?? cachedPageId;
          const target = retryTargetUrl(pageId, comp.fb_slug ?? null, comp.meta_library_url ?? null);
          if (target) {
            const retryRun = await startApifyRun(APIFY_TOKEN, APIFY_META_ACTOR, {
              urls: [{ url: target }], limitPerSource: 50, "scrapePageAds.activeStatus": "active",
            });
            if (retryRun) {
              await supa.from("lm_session_competitors")
                .update({ apify_run_id: retryRun, status: "scraping", scrape_retried: true,
                          scraping_started_at: new Date().toISOString() })
                .eq("id", comp.id);
              console.log(JSON.stringify({ level: "info", message: "scrape_retry",
                session_id, competitor_id: comp.id, via: pageId ? "page_id" : (comp.fb_slug ? "vanity" : "q") }));
              retried = true;
            }
          }
        }
        if (retried) continue; // další poll cyklus zpracuje retry run
        // retry se nepodařilo nastartovat → spadni do terminálního 0 (s scrape_retried=true ať neloopuje)
        await supa.from("lm_session_competitors").update({ scrape_retried: true }).eq("id", comp.id);
      }

      await supa.from("lm_session_competitors")
        .update({ status: scrapeStatus, ads_count: totalAds })
        .eq("id", comp.id);
    }

    // Re-check for any still scraping
    const { data: freshComps } = await supa
      .from("lm_session_competitors").select("status").eq("session_id", session_id);

    const fc = freshComps ?? [];
    if (fc.some(c => c.status === "scraping" || c.status === "pending")) {
      const scraped = fc.filter(c => c.status === "scraped" || c.status === "scrape_failed").length;
      return ok({ status: "scraping", scraped, total: fc.length });
    }

    // All scraped → guard: require at least 1 ad with real content before running AI
    const { count: meaningfulAds } = await supa
      .from("lm_session_ads")
      .select("id", { count: "exact", head: true })
      .eq("session_id", session_id)
      .not("primary_text", "is", null);

    if (!meaningfulAds) {
      console.error(`Session ${session_id}: 0 meaningful ads — failing before AI`);
      await supa.from("lm_sessions").update({
        status: "failed",
        error_message: "no_ads_scraped",
      }).eq("id", session_id);
      return ok({ status: "failed", error_message: "no_ads_scraped" });
    }

    // Trigger AI (only once)
    const { data: freshSession } = await supa
      .from("lm_sessions").select("status").eq("id", session_id).single();

    if (freshSession?.status === "processing") {
      await supa.from("lm_sessions").update({ status: "analyzing", analyzing_started_at: new Date().toISOString() }).eq("id", session_id);
      const fnBase = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;
      const auth = { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` };
      await fetch(`${fnBase}/analyze-lm-session`, {
        method: "POST", headers: auth, body: JSON.stringify({ session_id }),
      }).catch(e => console.error("analyze-lm-session trigger failed:", e));
      // Fire-and-forget: trvalé uložení náhledů reklam do Storage. Mimo kritickou
      // cestu analýzy (ta čte jen text/format), proto nezdržuje a běží paralelně.
      fetch(`${fnBase}/persist-ad-media`, {
        method: "POST", headers: auth, body: JSON.stringify({ session_id }),
      }).catch(e => console.error("persist-ad-media trigger failed:", e));
    }

    return ok({ status: "analyzing" });
  } catch (e) {
    console.error("poll-lm-pipeline error:", e);
    return err((e as Error).message, 500);
  }
});
