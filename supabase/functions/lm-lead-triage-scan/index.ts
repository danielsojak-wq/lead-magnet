import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DAY_CHECKPOINT, ECOMAIL_PIPELINE_ID, TRIAGE_STATUS } from "../_shared/lm-triage-config.ts";

// Manuálně spouštěný scan (tlačítko v /dev/lead-triage, žádný cron).
//
// KTERÝ SLOUPEC = VSTUP DO NURTURING SEKVENCE → `lm_sessions.completed_at`.
// Ověřeno v kódu: analyze-lm-session nastaví `status:"ready" + completed_at:now()`
// a HNED NATO volá syncToEcomail() → kontakt vzniká v Ecomailu přesně v tomto okamžiku.
//
// ZDROJ PRAVDY O OTEVŘENÍCH = Ecomail GET /pipelines/{id}/stats-detail.
// Vrací mapu { "<email>": { open, send, unsub, ... } } KUMULATIVNĚ za celou dobu, takže
// "0 otevření" je konečně poctivé tvrzení. (Dřív se četlo z lm_email_events plněné
// webhookem — ten ale neposílá historii, takže starší leady vypadaly jako channel
// mismatch jen proto, že jsme tehdy neposlouchali. Kvůli tomu existoval floor date;
// ten je teď zrušený a scan hodnotí všechny leady bez ohledu na stáří.)
//
// Do triage jde lead POUZE když platí VŠECHNO:
//   • completed_at ≤ now() - DAY_CHECKPOINT dní   (dost dlouho v sekvenci)
//   • je v Ecomail pipeline                        (víme o něm)
//   • send ≥ 1                                     (nějaký mail fakt dostal)
//   • open = 0                                     (a ani jeden neotevřel)
//   • unsub = 0                                    (odhlášení ≠ channel mismatch)
//
// Koho v pipeline NENAJDEME, ten se do triage NEDOSTANE — o jeho otevřeních nevíme nic
// (typicky leady s neúspěšnou analýzou, které se do Ecomailu vůbec nesynchronizovaly).
// Radši ho vynechat než oslovovat naslepo.

const ECOMAIL_BASE = "https://api2.ecomailapp.cz";

type EcomailStat = { open: number; send: number; unsub: number };

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

/** Stáhne per-kontaktní statistiky nurturing automatizace (všechny stránky). */
async function fetchEcomailStats(apiKey: string): Promise<Record<string, EcomailStat>> {
  const out: Record<string, EcomailStat> = {};
  let url: string | null = `${ECOMAIL_BASE}/pipelines/${ECOMAIL_PIPELINE_ID}/stats-detail`;
  let pages = 0;

  // Strop na stránky — pojistka proti zacyklení na next_page_url.
  while (url && pages < 50) {
    const res: Response = await fetch(url, { headers: { key: apiKey, "Content-Type": "application/json" } });
    if (!res.ok) {
      throw new Error(`Ecomail stats-detail HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const d = await res.json();

    // `subscribers` je OBJEKT klíčovaný emailem (ne pole). Prázdná pipeline vrací [].
    const subs = d?.subscribers;
    if (subs && !Array.isArray(subs)) {
      for (const [email, v] of Object.entries<Record<string, unknown>>(subs)) {
        out[String(email).toLowerCase()] = {
          open: Number(v?.open ?? 0),
          send: Number(v?.send ?? 0),
          unsub: Number(v?.unsub ?? 0),
        };
      }
    }
    url = (d?.next_page_url as string | null) ?? null;
    pages++;
  }
  return out;
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

    const apiKey = Deno.env.get("ECOMAIL_API_KEY");
    if (!apiKey) return json({ error: "ECOMAIL_API_KEY not configured" }, 500);

    const supa = admin();
    const cutoff = new Date(Date.now() - DAY_CHECKPOINT * 86400_000).toISOString();

    // 1) Sessions, které vstoupily do sekvence před ≥ DAY_CHECKPOINT dny.
    const { data: sessions, error: sErr } = await supa
      .from("lm_sessions")
      .select("id, email, eshop_url, completed_at")
      .not("completed_at", "is", null)
      .not("email", "is", null)
      .lte("completed_at", cutoff)
      .order("completed_at", { ascending: false });
    if (sErr) throw sErr;

    // Jeden lead může mít víc sessions → ber nejnovější dokončenou (email je v triage unique).
    const byEmail = new Map<string, { id: string; email: string; eshop_url: string | null; completed_at: string }>();
    for (const s of sessions ?? []) {
      const key = String(s.email).toLowerCase();
      if (!byEmail.has(key)) byEmail.set(key, s as never);
    }
    if (!byEmail.size) {
      return json({ ok: true, scanned: 0, engaged: 0, unknown: 0, unsubscribed: 0, already_in_triage: 0, created: 0 });
    }

    // 2) Ecomail — kumulativní open/send/unsub per kontakt.
    const stats = await fetchEcomailStats(apiKey);

    // 3) Kdo už v triage je (jakýkoli status) → idempotence, nepřepisovat.
    const { data: existing, error: eErr } = await supa
      .from("lm_lead_triage").select("email").in("email", [...byEmail.keys()]);
    if (eErr) throw eErr;
    const already = new Set((existing ?? []).map((r: { email: string }) => String(r.email).toLowerCase()));

    // 4) Roztřídění.
    let engaged = 0, unknown = 0, unsubscribed = 0, noMail = 0;
    const rows: Array<Record<string, unknown>> = [];

    for (const [email, s] of byEmail) {
      const st = stats[email];
      if (!st) { unknown++; continue; }              // není v Ecomailu → nevíme
      if (st.unsub > 0) { unsubscribed++; continue; } // odhlásil se → ne channel mismatch
      if (st.send === 0) { noMail++; continue; }      // žádný mail nedostal → nemá co otevřít
      if (st.open > 0) { engaged++; continue; }       // otevřel → e-mail mu funguje
      if (already.has(email)) continue;               // už v triage

      rows.push({
        email,
        session_id: s.id,
        domain: domainOf(s.eshop_url),
        checkpoint_reached_at: new Date(new Date(s.completed_at).getTime() + DAY_CHECKPOINT * 86400_000).toISOString(),
        status: TRIAGE_STATUS.NEEDS_REVIEW,
      });
    }

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
      scanned: byEmail.size,
      engaged,
      unsubscribed,
      no_mail_sent: noMail,
      unknown,                       // není v Ecomail pipeline → vědomě nehodnotíme
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
