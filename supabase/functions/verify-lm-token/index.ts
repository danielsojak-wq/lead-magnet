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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const token = (body.token as string | undefined)?.trim();
    if (!token) return err("token required");

    const supa = admin();

    const { data: session, error: sessErr } = await supa
      .from("lm_sessions")
      .select("id, status, token_expires_at, email_verified_at")
      .eq("verification_token", token)
      .maybeSingle();

    if (sessErr) return err(sessErr.message, 500);
    if (!session) return err("Odkaz není platný nebo byl již použit.", 404);

    // Expiry check
    if (new Date(session.token_expires_at) < new Date()) {
      return err("Ověřovací odkaz vypršel. Vraťte se zpět a zadejte email znovu.", 410);
    }

    // Pokud ještě není ověřeno — ověříme
    if (!session.email_verified_at) {
      const { error: updateErr } = await supa
        .from("lm_sessions")
        .update({
          email_verified_at: new Date().toISOString(),
          status: "urls_pending",
        })
        .eq("id", session.id);
      if (updateErr) return err(updateErr.message, 500);
    }

    return ok({ session_id: session.id });
  } catch (e) {
    console.error("verify-lm-token error:", e);
    return err((e as Error).message, 500);
  }
});
