import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
function htmlPage(title: string, body: string): Response {
  return new Response(`<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;">
  <div style="max-width:400px;width:100%;margin:32px auto;background:#fff;border-radius:16px;padding:48px 32px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
    ${body}
    <a href="${SITE_URL}" style="display:inline-block;margin-top:24px;background:#4f11ff;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 28px;border-radius:10px;">Zpět na úvod</a>
  </div>
</body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const isGet = req.method === "GET";

  try {
    let token: string | undefined;

    if (isGet) {
      token = new URL(req.url).searchParams.get("token") ?? undefined;
    } else {
      const body = await req.json();
      token = (body.token as string | undefined)?.trim();
    }

    if (!token) {
      if (isGet) return htmlPage("Chybí token", "<p style='color:#6b7280'>Ověřovací odkaz není platný.</p>");
      return err("token required");
    }

    const supa = admin();

    const { data: session, error: sessErr } = await supa
      .from("lm_sessions")
      .select("id, status, token_expires_at, email_verified_at")
      .eq("verification_token", token)
      .maybeSingle();

    if (sessErr) {
      if (isGet) return htmlPage("Chyba serveru", `<p style='color:#6b7280'>${sessErr.message}</p>`);
      return err(sessErr.message, 500);
    }
    if (!session) {
      if (isGet) return htmlPage("Odkaz není platný", "<p style='color:#6b7280'>Ověřovací odkaz není platný nebo byl již použit.</p>");
      return err("Odkaz není platný nebo byl již použit.", 404);
    }

    if (new Date(session.token_expires_at) < new Date()) {
      if (isGet) return htmlPage("Odkaz vypršel", "<p style='color:#6b7280'>Ověřovací odkaz vypršel. Vraťte se zpět a zadejte email znovu.</p>");
      return err("Ověřovací odkaz vypršel. Vraťte se zpět a zadejte email znovu.", 410);
    }

    if (!session.email_verified_at) {
      const { error: updateErr } = await supa
        .from("lm_sessions")
        .update({ email_verified_at: new Date().toISOString(), status: "urls_pending" })
        .eq("id", session.id);
      if (updateErr) {
        if (isGet) return htmlPage("Chyba serveru", `<p style='color:#6b7280'>${updateErr.message}</p>`);
        return err(updateErr.message, 500);
      }
    }

    if (isGet) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${SITE_URL}/analyze/${session.id}` },
      });
    }

    return ok({ session_id: session.id });
  } catch (e) {
    console.error("verify-lm-token error:", e);
    if (isGet) return htmlPage("Chyba serveru", `<p style='color:#6b7280'>${(e as Error).message}</p>`);
    return err((e as Error).message, 500);
  }
});
