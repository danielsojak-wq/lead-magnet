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

function buildEmailHtml(verifyUrl: string): string {
  return `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

    <div style="background:linear-gradient(135deg,#4f11ff,#7c3aed);padding:32px 32px 28px;">
      <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.6);margin-bottom:8px;">Performind Marketing</div>
      <h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;line-height:1.2;">
        Ověřte email<br>a spusťte analýzu
      </h1>
    </div>

    <div style="padding:32px;">
      <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">Ahoj,</p>
      <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.6;">
        Klikněte na tlačítko níže. Email ověříme a vaše analýza se <strong>automaticky spustí</strong>.
        Odkaz je platný <strong>24 hodin</strong>.
      </p>

      <div style="text-align:center;margin:32px 0;">
        <a href="${verifyUrl}"
           style="display:inline-block;background:#4f11ff;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:16px 36px;border-radius:12px;letter-spacing:0.01em;">
          Ověřit email a spustit analýzu →
        </a>
      </div>

      <div style="background:#f9fafb;border-radius:10px;padding:16px;margin-top:24px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">Co se stane po kliknutí</p>
        <ul style="margin:0;padding:0 0 0 16px;font-size:13px;color:#6b7280;line-height:1.8;">
          <li>AI nascrapuje a analyzuje reklamy vaší konkurence</li>
          <li>Dostanete radar, quick wins a konkrétní doporučení</li>
          <li>Výsledky se zobrazí přímo v prohlížeči</li>
        </ul>
      </div>

      <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
        Pokud jste o analýzu nežádali, tento email ignorujte.<br>
        Odkaz: <a href="${verifyUrl}" style="color:#4f11ff;word-break:break-all;">${verifyUrl}</a>
      </p>
    </div>

    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0;font-size:11px;color:#9ca3af;">
        © ${new Date().getFullYear()} Performind Marketing s.r.o. · Vyšehradská 1349/2, Praha 2
      </p>
    </div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) return err("RESEND_API_KEY not configured", 500);

    const body = await req.json();
    const email = (body.email as string | undefined)?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err("Neplatný email");

    const eshop_url: string | undefined = body.eshop_url;
    const eshop_meta_url: string | undefined = body.eshop_meta_url;
    const competitors: Array<{ url: string; meta_url?: string; position: number }> = body.competitors ?? [];

    const supa = admin();

    const { data: existing } = await supa
      .from("lm_sessions")
      .select("id, status")
      .eq("email", email)
      .maybeSingle();

    let sessionId: string;
    let token: string;

    const TEST_EMAILS = ["daniel.sojak@performind.cz"];

    // Block re-submission once analysis is underway or complete
    const nonResettableStatuses = ["urls_pending", "processing", "ready", "failed"];
    if (existing && nonResettableStatuses.includes(existing.status) && !TEST_EMAILS.includes(email)) {
      return ok({ ok: true, already_verified: true });
    }

    // Test email — always reset
    if (existing && TEST_EMAILS.includes(email)) {
      await supa.from("lm_sessions").delete().eq("id", existing.id);
    }

    if (existing && !TEST_EMAILS.includes(email)) {
      // Refresh token for existing email_pending session
      const newToken = crypto.randomUUID();
      await supa
        .from("lm_sessions")
        .update({
          verification_token: newToken,
          token_expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          eshop_url: eshop_url ?? null,
          eshop_meta_library_url: eshop_meta_url ?? null,
        })
        .eq("id", existing.id);
      sessionId = existing.id;
      token = newToken;

      // Replace competitors
      await supa.from("lm_session_competitors").delete().eq("session_id", sessionId);
    } else {
      // New session
      const { data: created, error: insertErr } = await supa
        .from("lm_sessions")
        .insert({
          email,
          eshop_url: eshop_url ?? null,
          eshop_meta_library_url: eshop_meta_url ?? null,
        })
        .select()
        .single();
      if (insertErr || !created) return err(insertErr?.message ?? "DB error", 500);
      sessionId = created.id;
      token = created.verification_token;
    }

    // Store competitors
    if (competitors.length > 0) {
      await supa.from("lm_session_competitors").insert(
        competitors.map((c) => ({
          session_id: sessionId,
          position: c.position,
          url: c.url,
          meta_library_url: c.meta_url ?? null,
        })),
      );
    }

    const verifyUrl = `${SITE_URL}/verify?token=${token}`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Performind Marketing <vysledek@analyza.performind.cz>",
        to: [email],
        subject: "Ověřte email a spusťte analýzu zdarma",
        html: buildEmailHtml(verifyUrl),
      }),
    });

    if (!resendRes.ok) {
      const detail = await resendRes.text();
      console.error("Resend error:", detail);
      return err("Nepodařilo se odeslat email", 502);
    }

    return ok({ ok: true, session_id: sessionId });
  } catch (e) {
    console.error("send-verification-email error:", e);
    return err((e as Error).message, 500);
  }
});
