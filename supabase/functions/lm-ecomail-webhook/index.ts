import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Ecomail webhook receiver → lm_email_events.
//
// PAYLOAD (ověřeno v docs.ecomail.cz/api-reference/webhooks/events): SparkPost-style
// envelope, POST jako POLE událostí:
//   [{ "msys": { "message_event": {
//        type: "open" | "initial_open" | "click" | "bounce" | "delivery" | ...,
//        rcpt_to: "<email>", timestamp: "<unix sekundy, string>",
//        rcpt_meta: { campaign_id, pipeline_id, pipeline_action_id }, event_id, message_id
//   }}}]
//
// POZOR: webhook URL je v Ecomailu GLOBÁLNÍ pro celý účet → chodí sem eventy ze
// všech kampaní/automatizací, ne jen z lead magnetu. Ukládáme vše, filtr až ve scanu.
//
// verify_jwt=false — Ecomail neumí posílat JWT. Volitelná ochrana: když je nastavený
// ECOMAIL_WEBHOOK_SECRET, vyžadujeme ?s=<secret> v URL (Daniel ho přidá při registraci).

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// initial_open i open = otevření; normalizujeme na "open", ať scan řeší jeden typ.
// Originální hodnota zůstává v raw_payload.
function normalizeType(t: string): string {
  return t === "initial_open" ? "open" : t;
}

function toIso(ts: unknown): string | null {
  const n = Number(ts);
  if (!n || !isFinite(n)) return null;
  // Ecomail posílá unix v sekundách; tolerujeme i milisekundy.
  return new Date(n < 1e12 ? n * 1000 : n).toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const secret = Deno.env.get("ECOMAIL_WEBHOOK_SECRET");
  if (secret) {
    const provided = new URL(req.url).searchParams.get("s");
    if (provided !== secret) return json({ error: "unauthorized" }, 401);
  }

  try {
    const body = await req.json().catch(() => null);
    // Ecomail posílá pole; tolerujeme i jeden objekt.
    const raw = Array.isArray(body) ? body : body ? [body] : [];

    const rows = raw.flatMap((entry: any) => {
      const ev = entry?.msys?.message_event ?? entry?.message_event ?? entry;
      const email = ev?.rcpt_to;
      const type = ev?.type;
      if (!email || !type) return [];
      const meta = ev?.rcpt_meta ?? {};
      return [{
        email: String(email).toLowerCase(),
        event_type: normalizeType(String(type)),
        occurred_at: toIso(ev?.timestamp),
        automation_email_id: meta.pipeline_action_id ?? meta.pipeline_id ?? meta.campaign_id ?? null,
        raw_payload: ev,
      }];
    });

    if (!rows.length) {
      console.log(JSON.stringify({ level: "warn", message: "ecomail_webhook_no_events", received: raw.length }));
      return json({ ok: true, stored: 0 });
    }

    const supa = admin();
    const { error } = await supa.from("lm_email_events").insert(rows);
    if (error) {
      console.error("lm_email_events insert failed:", error.message);
      return json({ error: error.message }, 500);
    }

    console.log(JSON.stringify({ level: "info", message: "ecomail_webhook_stored", count: rows.length }));
    return json({ ok: true, stored: rows.length });
  } catch (e) {
    console.error("lm-ecomail-webhook error:", e);
    return json({ error: String(e) }, 500);
  }
});
