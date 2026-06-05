import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

function ok(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── HTML email builder ───────────────────────────────────────────────────────
// Hlavička + patička IDENTICKÉ s verifikačním emailem (logo, styl, Brno adresa).
// Tělo = teaser + lime CTA na /results/<sessionId>. Žádný rozpad hráčů (jen na webu).

function domainName(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function buildEmailHtml({
  eshopDomain,
  resultsUrl,
  siteUrl,
}: {
  eshopDomain: string;
  resultsUrl: string;
  siteUrl: string;
}): string {
  return `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

    <!-- Header (identické s verifikačním emailem) -->
    <div style="background:linear-gradient(135deg,#4f11ff,#7c3aed);padding:32px 32px 28px;">
      <img src="${siteUrl}/performind-logo-email.png" alt="Performind Marketing" height="18" style="display:block;height:18px;width:auto;margin:0 auto 32px;border:0;">
      <h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;line-height:1.25;">
        Vaše analýza konkurence na Metě je hotová
      </h1>
    </div>

    <div style="padding:32px;">
      <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">Dobrý den,</p>
      <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.6;">
        Analýza pro <strong>${eshopDomain}</strong> je připravená. Prošli jsme aktivní reklamy vašich
        konkurentů na Metě, vyhodnotili jejich strategii a našli mezery, které můžete využít.
      </p>

      <div style="text-align:center;margin:32px 0;">
        <a href="${resultsUrl}"
           style="display:inline-block;background:#b0f221;color:#111827;text-decoration:none;font-weight:700;font-size:15px;padding:16px 36px;border-radius:12px;letter-spacing:0.01em;">
          Zobrazit analýzu →
        </a>
      </div>

      <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
        Odkaz vede na vaši kompletní analýzu — porovnání hráčů, reklamní mix a konkrétní doporučení.
      </p>
    </div>

    <!-- Footer (identické s verifikačním emailem) -->
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0;font-size:11px;color:#9ca3af;">
        © ${new Date().getFullYear()} Performind Marketing s.r.o. · Masarykova 32, 602 00 Brno
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const sessionId = body.session_id as string | undefined;
    if (!sessionId) return err("session_id required");

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) return err("RESEND_API_KEY not configured", 500);

    const supa = admin();

    // Fetch session
    const { data: session, error: sessionErr } = await supa
      .from("lm_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionErr) throw sessionErr;
    if (!session) return err("session not found", 404);
    if (session.status !== "ready") return err("analysis not ready yet", 409);

    const siteUrl = Deno.env.get("SITE_URL") ?? "https://analyza.performind.cz";
    const resultsUrl = `${siteUrl}/results/${sessionId}`;

    const html = buildEmailHtml({
      eshopDomain: domainName(session.eshop_url ?? "") || "váš e-shop",
      resultsUrl,
      siteUrl,
    });

    // Send via Resend
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Performind Marketing <vysledek@analyza.performind.cz>",
        to: [session.email],
        subject: "Vaše analýza konkurence na Metě",
        html,
      }),
    });

    if (!resendRes.ok) {
      const detail = await resendRes.text();
      console.error("Resend error:", detail);
      throw new Error(`Resend API error: ${resendRes.status}`);
    }

    return ok({ success: true });
  } catch (e) {
    console.error(e);
    return err((e as Error).message, 500);
  }
});
