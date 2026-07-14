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

    return json({
      ok: true,
      // config → frontend NIKDY nehardcoduje DAY_CHECKPOINT ani ICP text
      config: { day_checkpoint: DAY_CHECKPOINT, icp_criteria: ICP_CRITERIA },
      counts: { needs_review: needsReview ?? 0, moved_to_manual: movedToManual ?? 0 },
      leads: enriched,
    });
  } catch (e) {
    console.error("lm-lead-triage-data error:", e);
    return json({ error: String(e) }, 500);
  }
});
