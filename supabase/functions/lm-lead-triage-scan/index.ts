import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DAY_CHECKPOINT, EVENT_DATA_SINCE, OPEN_EVENT_TYPES, TRIAGE_STATUS } from "../_shared/lm-triage-config.ts";

// Manuálně spouštěný scan (tlačítko v /dev/lead-triage, žádný cron).
//
// KTERÝ SLOUPEC = VSTUP DO NURTURING SEKVENCE → `lm_sessions.completed_at`.
// Ověřeno v kódu: analyze-lm-session nastaví `status:"ready" + completed_at:now()`
// a HNED NATO volá syncToEcomail() → kontakt vzniká v Ecomailu (tag lead-magnet-analyza,
// Den 0 tool email) přesně v tomto okamžiku. NENÍ to email_verified_at: ověření emailu
// je dřív a leady, jejichž analýza selhala, se do Ecomailu vůbec nedostanou
// (známý coupling ecomail-sync ↔ úspěšná analýza) → brát verified by dělalo
// falešné "0 otevření" u lidí, co nikdy žádný email nedostali.
//
// Pravidlo: completed_at ≤ now() - DAY_CHECKPOINT dní  A  0 open eventů
//           → upsert do lm_lead_triage se status='needs_review'.
// Lead s ≥1 open eventem se do lm_lead_triage NEZAPISUJE vůbec.
// Idempotence: existující email (jakýkoli status) se NEPŘEPISUJE, jen se vkládají nové.

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
    const cutoff = new Date(Date.now() - DAY_CHECKPOINT * 86400_000).toISOString();

    // 1) Sessions, které vstoupily do sekvence před ≥ DAY_CHECKPOINT dny.
    //    FLOOR: jen ty od EVENT_DATA_SINCE — pro starší leady nemáme open eventy
    //    (Ecomail webhook neposílá historii), takže "0 otevření" by u nich bylo
    //    falešné pozitivum. Viz komentář u EVENT_DATA_SINCE v configu.
    const { data: sessions, error: sErr } = await supa
      .from("lm_sessions")
      .select("id, email, eshop_url, completed_at")
      .not("completed_at", "is", null)
      .not("email", "is", null)
      .gte("completed_at", EVENT_DATA_SINCE)
      .lte("completed_at", cutoff)
      .order("completed_at", { ascending: false });
    if (sErr) throw sErr;

    // Jeden lead může mít víc sessions → ber nejnovější dokončenou (email je v triage unique).
    const byEmail = new Map<string, { id: string; email: string; eshop_url: string | null; completed_at: string }>();
    for (const s of sessions ?? []) {
      const key = String(s.email).toLowerCase();
      if (!byEmail.has(key)) byEmail.set(key, s as any);
    }
    const emails = [...byEmail.keys()];
    if (!emails.length) return json({ ok: true, scanned: 0, engaged: 0, already_in_triage: 0, created: 0 });

    // 2) Kdo email OTEVŘEL (≥1 open event) → engaged, do triage NEPATŘÍ.
    const { data: opens, error: oErr } = await supa
      .from("lm_email_events")
      .select("email")
      .in("event_type", OPEN_EVENT_TYPES as unknown as string[])
      .in("email", emails);
    if (oErr) throw oErr;
    const engaged = new Set((opens ?? []).map((r: any) => String(r.email).toLowerCase()));

    // 3) Kdo už v triage je (jakýkoli status) → idempotence, nepřepisovat.
    const { data: existing, error: eErr } = await supa
      .from("lm_lead_triage")
      .select("email")
      .in("email", emails);
    if (eErr) throw eErr;
    const already = new Set((existing ?? []).map((r: any) => String(r.email).toLowerCase()));

    // 4) Kandidáti = ani neotevřeli, ani nejsou v triage.
    const rows = emails
      .filter(e => !engaged.has(e) && !already.has(e))
      .map(e => {
        const s = byEmail.get(e)!;
        return {
          email: e,
          session_id: s.id,
          domain: domainOf(s.eshop_url),
          // checkpoint = moment, kdy uplynul DAY_CHECKPOINT od vstupu do sekvence
          checkpoint_reached_at: new Date(new Date(s.completed_at).getTime() + DAY_CHECKPOINT * 86400_000).toISOString(),
          status: TRIAGE_STATUS.NEEDS_REVIEW,
        };
      });

    let created = 0;
    if (rows.length) {
      // ignoreDuplicates → i při souběhu nikdy nepřepíše existující řádek.
      const { data: ins, error: iErr } = await supa
        .from("lm_lead_triage")
        .upsert(rows, { onConflict: "email", ignoreDuplicates: true })
        .select("id");
      if (iErr) throw iErr;
      created = ins?.length ?? 0;
    }

    const result = {
      ok: true,
      day_checkpoint: DAY_CHECKPOINT,
      event_data_since: EVENT_DATA_SINCE,
      scanned: emails.length,
      engaged: engaged.size,
      already_in_triage: already.size,
      created,
    };
    console.log(JSON.stringify({ level: "info", message: "lead_triage_scan", ...result }));
    return json(result);
  } catch (e) {
    console.error("lm-lead-triage-scan error:", e);
    return json({ error: String(e) }, 500);
  }
});
