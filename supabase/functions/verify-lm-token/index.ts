import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  normalizeEmail,
  normalizeDomain,
  extractIp,
  insertRateLimitAttempts,
  logRateEvent,
} from "../_shared/rate-limits.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://analyza.performind.cz";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // GET: email link click — redirect to React app
  if (req.method === "GET") {
    const token = new URL(req.url).searchParams.get("token") ?? "";
    return new Response(null, {
      status: 302,
      headers: { Location: `${SITE_URL}/verify?token=${encodeURIComponent(token)}` },
    });
  }

  // POST: called by React VerifyPage
  try {
    const body = await req.json();
    const token = (body.token as string | undefined)?.trim();
    if (!token) return err("token required");

    const supa = admin();

    const { data: session, error: sessErr } = await supa
      .from("lm_sessions")
      .select("id, status, token_expires_at, email_verified_at, email, eshop_url, fbp, fbc, client_ip, client_user_agent, completereg_event_id")
      .eq("verification_token", token)
      .maybeSingle();

    if (sessErr) return err(sessErr.message, 500);
    if (!session) return err("Odkaz není platný nebo byl již použit.", 404);

    if (new Date(session.token_expires_at) < new Date()) {
      return err("Ověřovací odkaz vypršel. Vraťte se zpět a zadejte email znovu.", 410);
    }

    if (!session.email_verified_at) {
      const { error: updateErr } = await supa
        .from("lm_sessions")
        .update({ email_verified_at: new Date().toISOString(), status: "urls_pending" })
        .eq("id", session.id);
      if (updateErr) return err(updateErr.message, 500);

      // Fire-and-forget: record this verified attempt for rate limiting.
      // Non-blocking — a failure here must not kill the lead.
      const ip = extractIp(req);
      const email = normalizeEmail(session.email ?? "");
      const domain = normalizeDomain(session.eshop_url ?? "");

      insertRateLimitAttempts(supa, { ip, email, domain }, session.id).catch((e: unknown) => {
        logRateEvent({
          level: "error",
          message: "rate_limit_insert_failed",
          session_id: session.id,
          error: String(e),
        });
      });

      // ── Meta CAPI CompleteRegistration (CAPI-only, server-side) ──
      // Recyklujeme matching data z Lead momentu (klik může přijít z jiného
      // zařízení → čerstvá data by zhoršila attribution). Idempotence přes
      // completereg_event_id. Non-blocking.
      if (!session.completereg_event_id) {
        const crEventId = crypto.randomUUID();
        await supa.from("lm_sessions").update({ completereg_event_id: crEventId }).eq("id", session.id);
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/meta-capi`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
          body: JSON.stringify({
            event_name: "CompleteRegistration",
            event_id: crEventId,
            event_source_url: `${SITE_URL}/verify`,
            email: session.email ?? undefined,
            fbp: session.fbp ?? undefined,
            fbc: session.fbc ?? undefined,
            client_ip: session.client_ip ?? undefined,
            client_user_agent: session.client_user_agent ?? undefined,
          }),
        }).catch((e) => console.error("meta-capi CompleteRegistration failed:", String(e)));
      }
    }

    return ok({ session_id: session.id });
  } catch (e) {
    console.error("verify-lm-token error:", e);
    return err((e as Error).message, 500);
  }
});
