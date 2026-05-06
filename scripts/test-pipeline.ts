#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Local E2E pipeline test — runs against production Supabase
 * Usage: deno run --allow-net --allow-env scripts/test-pipeline.ts
 *
 * Required env vars:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   APIFY_API_TOKEN
 *   LOVABLE_API_KEY
 *   TEST_SESSION_ID   (existing verified session)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APIFY_TOKEN        = Deno.env.get("APIFY_API_TOKEN")!;
const LOVABLE_KEY        = Deno.env.get("LOVABLE_API_KEY")!;
const SESSION_ID         = Deno.env.get("TEST_SESSION_ID")!;

const APIFY_META_ACTOR   = "apify~facebook-ads-scraper";
const APIFY_GOOGLE_ACTOR = "easyapi~google-ads-transparency-center-scraper";
const AI_URL             = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL           = "google/gemini-2.5-flash";

const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const log = (msg: string) => console.log(`[${new Date().toISOString().slice(11,19)}] ${msg}`);

// ─── Apify helpers ────────────────────────────────────────────────────────────

async function startRun(actor: string, input: unknown): Promise<string> {
  const res = await fetch(`https://api.apify.com/v2/acts/${actor}/runs?token=${APIFY_TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Apify start failed (${actor}): ${res.status} ${await res.text()}`);
  const d = await res.json();
  return d.data.id;
}

async function waitForRun(runId: string, label: string): Promise<any[]> {
  log(`  Waiting for Apify run ${runId} (${label})...`);
  while (true) {
    await new Promise(r => setTimeout(r, 15_000));
    const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`);
    const d = await res.json();
    const status: string = d?.data?.status ?? "";
    const datasetId: string = d?.data?.defaultDatasetId ?? "";
    log(`    status: ${status}`);
    if (status === "RUNNING" || status === "READY" || status === "STARTING") continue;
    if (status !== "SUCCEEDED") {
      log(`    FAILED: ${status}`);
      return [];
    }
    const items = await (await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&clean=true&format=json`
    )).json() as any[];
    log(`    downloaded ${items.length} items`);
    return items;
  }
}

// ─── Ad mappers ───────────────────────────────────────────────────────────────

function mapMeta(it: any, compId: string) {
  const sn = it?.snapshot || it;
  const toDate = (v: any) => {
    if (!v) return null;
    const n = typeof v === "number" ? v * (v < 1e12 ? 1000 : 1) : Date.parse(v);
    return n && !isNaN(n) ? new Date(n).toISOString().slice(0, 10) : null;
  };
  const imgs = sn?.images || it?.images || [];
  const cards = sn?.cards || it?.cards || [];
  const vids = sn?.videos || it?.videos || [];
  return {
    session_id: SESSION_ID, competitor_id: compId, ad_source: "meta",
    ad_archive_id: String(it?.ad_archive_id || it?.adArchiveID || it?.id || crypto.randomUUID()),
    image_url: imgs[0]?.originalImageUrl || cards.find((c: any) => c.originalImageUrl)?.originalImageUrl || null,
    video_url: vids[0]?.videoHdUrl || vids[0]?.videoSdUrl || null,
    primary_text: sn?.body?.text || sn?.title || it?.primary_text || null,
    is_active: it?.is_active ?? true,
    ad_start_date: toDate(it?.start_date || it?.startDate || sn?.creation_time),
    ad_type: null,
  };
}

function mapGoogle(it: any, compId: string) {
  const toDate = (v: any) => {
    if (!v) return null;
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const n = typeof v === "number" ? v * (v < 1e12 ? 1000 : 1) : Date.parse(v);
    return n && !isNaN(n) ? new Date(n).toISOString().slice(0, 10) : null;
  };
  const rawId = it?.creativeId || it?.creative_id || it?.id || crypto.randomUUID();
  const headline = it?.headline || it?.title || null;
  const desc = it?.description || it?.body || it?.text || null;
  return {
    session_id: SESSION_ID, competitor_id: compId, ad_source: "google",
    ad_archive_id: `g_${rawId}`,
    image_url: it?.imageUrl || it?.image_url || it?.thumbnailUrl || null,
    video_url: it?.videoUrl || it?.video_url || null,
    primary_text: [headline, desc].filter(Boolean).join("\n") || null,
    is_active: it?.isActive ?? it?.is_active ?? true,
    ad_start_date: toDate(it?.firstShownDate || it?.first_shown_date || it?.startDate),
    ad_type: null,
  };
}

// ─── AI helpers ───────────────────────────────────────────────────────────────

function extractJson(text: string): unknown {
  const stripped = text.replace(/```(?:json)?/g, "").replace(/```/g, "").trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in AI response");
  return JSON.parse(match[0]);
}

async function callAI(system: string, user: string, maxTokens = 1200): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(AI_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: AI_MODEL, max_tokens: maxTokens, temperature: 0.3,
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
        }),
      });
      if (!res.ok) throw new Error(`AI HTTP ${res.status}: ${await res.text()}`);
      const d = await res.json();
      return extractJson(d?.choices?.[0]?.message?.content ?? "");
    } catch (e) {
      if (attempt === 1) throw e;
      log(`  AI retry after error: ${e}`);
    }
  }
}

// ─── Test data ────────────────────────────────────────────────────────────────

const COMPETITORS = [
  {
    url: "https://4camping.cz",
    metaUrl: "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=CZ&is_targeted_country=false&media_type=all&search_type=page&sort_data[direction]=desc&sort_data[mode]=total_impressions&view_all_page_id=512343745604527",
  },
  {
    url: "https://outdoormarket.cz",
    metaUrl: "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=CZ&is_targeted_country=false&media_type=all&search_type=page&sort_data[direction]=desc&sort_data[mode]=total_impressions&view_all_page_id=487174501343324",
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log("=== E2E Pipeline Test ===");
  log(`Session: ${SESSION_ID}`);

  // Reset session
  await supa.from("lm_sessions").update({ status: "processing", ai_cross_analysis: null, cross_summary: null }).eq("id", SESSION_ID);
  await supa.from("lm_session_ads").delete().eq("session_id", SESSION_ID);

  // Load competitors from DB
  const { data: comps } = await supa
    .from("lm_session_competitors")
    .select("id, url, meta_library_url")
    .eq("session_id", SESSION_ID)
    .order("position");
  if (!comps?.length) throw new Error("No competitors in DB — run start-lm-analysis first");
  log(`Found ${comps.length} competitors`);

  // ─── Step 1: Start all Apify runs in parallel ────────────────────────────
  log("\n[1] Starting Apify runs...");
  const runs: Array<{ compId: string; url: string; metaRunId?: string; googleRunId?: string }> = [];

  await Promise.all(comps.map(async (comp) => {
    const entry: typeof runs[0] = { compId: comp.id, url: comp.url };

    // Meta Ads
    if (comp.meta_library_url) {
      try {
        entry.metaRunId = await startRun(APIFY_META_ACTOR, {
          startUrls: [{ url: comp.meta_library_url }],
          resultsLimit: 50,
          activeStatus: "active",
        });
        log(`  ${comp.url} Meta run: ${entry.metaRunId}`);
      } catch (e) { log(`  Meta start failed for ${comp.url}: ${e}`); }
    }

    // Google Ads
    const domain = new URL(comp.url).hostname.replace(/^www\./, "");
    try {
      entry.googleRunId = await startRun(APIFY_GOOGLE_ACTOR, {
        startUrls: [{ url: `https://adstransparency.google.com/?region=CZ&domain=${domain}` }],
        maxItems: 50,
      });
      log(`  ${comp.url} Google run: ${entry.googleRunId}`);
    } catch (e) { log(`  Google start failed for ${comp.url}: ${e}`); }

    runs.push(entry);
  }));

  // ─── Step 2: Wait for all runs and save results ──────────────────────────
  log("\n[2] Waiting for Apify runs...");
  let totalAds = 0;

  for (const run of runs) {
    // Meta
    if (run.metaRunId) {
      const items = await waitForRun(run.metaRunId, `${run.url} Meta`);
      if (items.length) {
        const rows = items.map(it => mapMeta(it, run.compId));
        const { error } = await supa.from("lm_session_ads").upsert(rows, { onConflict: "session_id,ad_archive_id" });
        if (error) log(`  Meta upsert error: ${error.message}`);
        else { log(`  Saved ${rows.length} Meta ads for ${run.url}`); totalAds += rows.length; }
      }
    }
    // Google
    if (run.googleRunId) {
      const items = await waitForRun(run.googleRunId, `${run.url} Google`);
      if (items.length) {
        const rows = items.map(it => mapGoogle(it, run.compId));
        const { error } = await supa.from("lm_session_ads").upsert(rows, { onConflict: "session_id,ad_archive_id" });
        if (error) log(`  Google upsert error: ${error.message}`);
        else { log(`  Saved ${rows.length} Google ads for ${run.url}`); totalAds += rows.length; }
      }
    }
    // Update ads_count
    const { count } = await supa.from("lm_session_ads")
      .select("id", { count: "exact", head: true }).eq("competitor_id", run.compId);
    await supa.from("lm_session_competitors").update({ status: "scraped", ads_count: count ?? 0 }).eq("id", run.compId);
  }
  log(`Total ads saved: ${totalAds}`);

  // ─── Step 3: AI L1 analysis ──────────────────────────────────────────────
  log("\n[3] Running L1 AI analysis for each competitor...");

  const { data: allAds } = await supa.from("lm_session_ads").select("*").eq("session_id", SESSION_ID);
  const adsMap = new Map<string, any[]>();
  for (const ad of allAds ?? []) {
    const list = adsMap.get(ad.competitor_id) ?? [];
    list.push(ad);
    adsMap.set(ad.competitor_id, list);
  }

  const L1_SYSTEM = `Jsi senior marketingový stratég. Analyzuj reklamní data a vrať POUZE validní JSON bez markdown bloků.`;
  const l1User = (name: string, url: string, ads: any[]) => {
    const rows = ads.slice(0, 30).map(a => ({ text: (a.primary_text || "").slice(0, 200), type: a.ad_type, source: a.ad_source, active: a.is_active }));
    return `DATA: ${JSON.stringify({ name, url, total_ads: ads.length, ads: rows })}
Vrať JSON: {"reklamni_mix":{"meta":{"single_image":0,"carousel":0,"video":0,"stories":0},"google":{"search":0,"display":0,"video":0,"pmax":0}},"aktivita":{"pocet_aktivnich_reklam":0,"prumerna_delka_behu_dni":0,"frekvence_novych_reklam":"stredni"},"messaging":{"hlavni_claim":"","dominantni_emocni_apel":"logika","funnel_faze":"mix","osloveni":"tykani","pouziva_emoji":false,"socialni_dukaz":[]},"kreativni_vzorce":{"nejcastejsi_hook":"statement","prumerna_delka_textu":"stredni","top_reklama":{"popis":"","proc_funguje":""}},"landing_pages":{"typ":"mix","testuje_ab":false,"pouziva_slevy":false}}`;
  };

  const l1Results: any[] = [];
  await Promise.all(comps.map(async (comp, i) => {
    const ads = adsMap.get(comp.id) ?? [];
    log(`  L1 for ${comp.url}: ${ads.length} ads`);
    try {
      const result = await callAI(L1_SYSTEM, l1User(comp.url, comp.url, ads));
      l1Results[i] = result;
      const adMix = { brand: 0, sales: 0, retargeting: 0 };
      for (const a of ads) if (a.ad_type in adMix) adMix[a.ad_type as keyof typeof adMix]++;
      const total = adMix.brand + adMix.sales + adMix.retargeting;
      const pct = total ? { brand: Math.round(adMix.brand/total*100), sales: Math.round(adMix.sales/total*100), retargeting: Math.round(adMix.retargeting/total*100) } : adMix;
      await supa.from("lm_session_competitors").update({
        ai_analysis: result, status: "ready", ads_count: ads.length, ad_mix: pct,
      }).eq("id", comp.id);
      log(`  L1 saved for ${comp.url}`);
    } catch (e) { log(`  L1 failed for ${comp.url}: ${e}`); }
  }));

  // ─── Step 4: AI L2 synthesis ─────────────────────────────────────────────
  log("\n[4] Running L2 synthesis...");
  const L2_SYSTEM = `Jsi senior marketingový stratég. Na základě L1 analýz vrať syntézu. POUZE validní JSON bez markdown bloků.`;
  const l2User = (a: unknown, b: unknown, c: unknown) =>
    `ZADAVATEL:{"url":"https://nejoutdoor.cz","ads":[]} KONKURENT_A:${JSON.stringify(a??{})} KONKURENT_B:${JSON.stringify(b??{})}
Vrať JSON: {"category_truths":[{"vzorec":"","vysvetleni":""}],"co_funguje_vsem":[{"insight":"","detail":""}],"mezery_prilezitosti":[{"prilezitost":"","potencial":"vysoky","zduvodneni":""}],"pozice_zadavatele":{"silne_stranky":[""],"slabe_stranky":[""],"radar":{"objem_reklam":5,"kreativni_diverzita":5,"messaging_jasnost":5,"brand_konzistence":5,"funnel_pokryti":5}},"quick_wins":[{"akce":"","proc":"","obtiznost":"jednoduche"}]}`;

  try {
    const l2 = await callAI(L2_SYSTEM, l2User(l1Results[0], l1Results[1], null), 1500);
    await supa.from("lm_sessions").update({
      ai_cross_analysis: l2, status: "ready", completed_at: new Date().toISOString(),
    }).eq("id", SESSION_ID);
    log("  L2 saved, session status → ready");
  } catch (e) { log(`  L2 failed: ${e}`); }

  // ─── Step 5: Verify results ──────────────────────────────────────────────
  log("\n[5] Verification...");
  const { data: finalSession } = await supa.from("lm_sessions").select("status,ai_cross_analysis").eq("id", SESSION_ID).single();
  const { data: finalComps } = await supa.from("lm_session_competitors").select("url,status,ads_count,ai_analysis").eq("session_id", SESSION_ID);
  const { count: adsCount } = await supa.from("lm_session_ads").select("id", { count: "exact", head: true }).eq("session_id", SESSION_ID);

  log(`Session status: ${finalSession?.status}`);
  log(`ai_cross_analysis: ${finalSession?.ai_cross_analysis ? "✓ present" : "✗ missing"}`);
  log(`Total ads in DB: ${adsCount}`);
  for (const c of finalComps ?? []) {
    log(`  ${c.url}: status=${c.status} ads=${c.ads_count} ai_analysis=${c.ai_analysis ? "✓" : "✗"}`);
  }
  log("\n=== Done ===");
  log(`Results at: https://analyza.performind.cz/results/${SESSION_ID}`);
}

main().catch(e => { console.error("Fatal:", e); Deno.exit(1); });
