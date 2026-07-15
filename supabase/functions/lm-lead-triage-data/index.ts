import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DAY_CHECKPOINT, ICP_CRITERIA, TRIAGE_STATUS } from "../_shared/lm-triage-config.ts";

// Data vrstva pro /dev/lead-triage (heslem chráněná, stejný pattern jako list-dev-sessions).
// Tabulky mají RLS bez policy → frontend na ně nesmí přímo, čte přes tuhle fn (service role).
//
// action=list   → config + živé počty + leady se status='needs_review' (řazeno dle checkpointu)
// action=update → persistuje icp_fit a/nebo draft_message

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function domainOf(url: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    // FAIL-CLOSED: když env chybí, odmítni. (Naivní `body.password !== env` by při
    // nenastavené proměnné propustilo request bez hesla → undefined !== undefined = false.)
    const devPassword = Deno.env.get("PERFORMIND_DEV_PASSWORD");
    if (!devPassword || typeof body.password !== "string" || body.password !== devPassword) {
      return json({ error: "Unauthorized" }, 401);
    }
    const supa = admin();
    const action = (body.action as string) ?? "list";

    // ── update ────────────────────────────────────────────────────────────────
    if (action === "update") {
      const id = body.id as string | undefined;
      if (!id) return json({ error: "id required" }, 400);
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof body.icp_fit === "boolean" || body.icp_fit === null) patch.icp_fit = body.icp_fit;
      if (typeof body.draft_message === "string") patch.draft_message = body.draft_message;

      const { data, error } = await supa
        .from("lm_lead_triage").update(patch).eq("id", id)
        .select("id, icp_fit, draft_message").maybeSingle();
      if (error) throw error;
      return json({ ok: true, lead: data });
    }

    // ── skip ────────────────────────────────────────────────────────────────────
    // Odmítnutí leada (není fit). status='skipped' → zmizí z boardu (list bere jen
    // needs_review). Nevolá Ecomail ani Make — jen ho odklidí z fronty.
    if (action === "skip") {
      const id = body.id as string | undefined;
      if (!id) return json({ error: "id required" }, 400);
      const { error } = await supa
        .from("lm_lead_triage")
        .update({ status: TRIAGE_STATUS.SKIPPED, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return json({ ok: true });
    }

    // ── list ──────────────────────────────────────────────────────────────────
    const [{ count: needsReview }, { count: movedToManual }] = await Promise.all([
      supa.from("lm_lead_triage").select("id", { count: "exact", head: true })
        .eq("status", TRIAGE_STATUS.NEEDS_REVIEW),
      supa.from("lm_lead_triage").select("id", { count: "exact", head: true })
        .eq("status", TRIAGE_STATUS.MOVED_TO_MANUAL),
    ]);

    const { data: leads, error: lErr } = await supa
      .from("lm_lead_triage")
      .select("id, email, domain, session_id, checkpoint_reached_at, icp_fit, draft_message, status")
      .eq("status", TRIAGE_STATUS.NEEDS_REVIEW)
      .order("checkpoint_reached_at", { ascending: false });
    if (lErr) throw lErr;

    const sessionIds = (leads ?? []).map((l: any) => l.session_id).filter(Boolean);

    // quick wins ze session + 2 konkurenti (reálné domény — nikdy "Konkurent A/B")
    const [{ data: sessions }, { data: comps }] = await Promise.all([
      sessionIds.length
        ? supa.from("lm_sessions").select("id, ai_cross_analysis").in("id", sessionIds)
        : Promise.resolve({ data: [] as any[] }),
      sessionIds.length
        ? supa.from("lm_session_competitors").select("session_id, position, url")
            .in("session_id", sessionIds).gt("position", 0).order("position")
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const winsBySession = new Map<string, Array<{ akce: string; proc: string }>>();
    for (const s of sessions ?? []) {
      const qw = ((s as any).ai_cross_analysis?.quick_wins ?? []) as Array<any>;
      winsBySession.set((s as any).id, qw.map(w => ({ akce: w?.akce ?? "", proc: w?.proc ?? "" })).filter(w => w.akce));
    }
    const compsBySession = new Map<string, string[]>();
    for (const c of comps ?? []) {
      const sid = (c as any).session_id;
      const list = compsBySession.get(sid) ?? [];
      const d = domainOf((c as any).url);
      if (d) list.push(d);
      compsBySession.set(sid, list);
    }

    const enriched = (leads ?? []).map((l: any) => ({
      ...l,
      quick_wins: winsBySession.get(l.session_id) ?? [],
      competitors: compsBySession.get(l.session_id) ?? [],
      analysis_url: l.session_id
        ? `${Deno.env.get("SITE_URL") ?? "https://analyza.performind.cz"}/results/${l.session_id}`
        : null,
    }));

    // ── Funnel + denní série: analytika stavu VŠECH leadů z magnetu ─────────────
    // Bucket dle reálných stavů lm_sessions. Priorita: no_ads_scraped předchází
    // "analýza OK" i u status='ready' (5 leadů je ready+no_ads → bez reklam, ne plný nurturing).
    // Kategorie "other" = failed (mimo no_ads) + přechodné (scraping/analyzing).
    const bucketOf = (st: string, err: string | null): "email_pending" | "no_ads" | "analyza_ok" | "other" => {
      if (st === "email_pending") return "email_pending";
      if (err === "no_ads_scraped") return "no_ads";
      if (st === "ready" && !err) return "analyza_ok";
      return "other";
    };

    const { data: allSessions } = await supa
      .from("lm_sessions").select("status, error_message, created_at").not("email", "is", null);

    const funnel = { total: 0, email_pending: 0, analyza_ok: 0, no_ads: 0, failed_other: 0, in_progress: 0 };

    // Denní série pokrývá CELOU historii (od nejstaršího leadu po dnes, strop 365 dní).
    // Frontend si z ní sám ořeže okno (7/30/90/vše) a agreguje na týdny — proto tu
    // posíláme spojitou denní osu i s prázdnými dny, ne předpočítané okno.
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const cap = new Date(today); cap.setUTCDate(today.getUTCDate() - 364);
    let minMs = Infinity;
    for (const s of allSessions ?? []) {
      const t = Date.parse(String((s as any).created_at ?? ""));
      if (isFinite(t) && t < minMs) minMs = t;
    }
    let start = isFinite(minMs) ? new Date(minMs) : new Date(today);
    start.setUTCHours(0, 0, 0, 0);
    if (start < cap) start = cap;

    type Day = { date: string; analyza_ok: number; no_ads: number; email_pending: number; other: number };
    const series = new Map<string, Day>();
    for (let d = new Date(start); d <= today; d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      series.set(key, { date: key, analyza_ok: 0, no_ads: 0, email_pending: 0, other: 0 });
    }

    for (const s of allSessions ?? []) {
      funnel.total++;
      const st = String((s as any).status ?? "");
      const err = (s as any).error_message as string | null;
      const b = bucketOf(st, err);
      // funnel (all-time) — "other" rozpad na failed vs přechodné kvůli stávajícímu tvaru
      if (b === "other") { if (st === "failed") funnel.failed_other++; else funnel.in_progress++; }
      else funnel[b]++;
      // denní série
      const key = String((s as any).created_at ?? "").slice(0, 10);
      const day = series.get(key);
      if (day) day[b]++;
    }

    return json({
      ok: true,
      // config → frontend NIKDY nehardcoduje DAY_CHECKPOINT ani ICP text
      config: { day_checkpoint: DAY_CHECKPOINT, icp_criteria: ICP_CRITERIA },
      counts: { needs_review: needsReview ?? 0, moved_to_manual: movedToManual ?? 0 },
      funnel,
      daily: [...series.values()],
      leads: enriched,
    });
  } catch (e) {
    console.error("lm-lead-triage-data error:", e);
    return json({ error: String(e) }, 500);
  }
});
