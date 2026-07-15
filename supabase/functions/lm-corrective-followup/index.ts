import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Ops nástroj: opravný follow-up pro session, která napoprvé selhala a byla ručně
// re-runnutá do `ready`. Pošle omluvný mail s odkazem na výsledky (reply-to na
// Daniela) přes Resend A pushne kontakt do Ecomailu (nurturing) — idempotentně.
// NEsahá na pipeline funkce. Volá se ručně: POST { session_id, dry_run? }.

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
function ok(d: unknown) {
  return new Response(JSON.stringify(d), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function err(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function domainName(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

const REPLY_TO = "daniel.sojak@performind.cz";
const FROM = "Performind Marketing <vysledek@analyza.performind.cz>";
const SUBJECT = "Vaše konkurenční analýza je připravená (omlouváme se za zdržení)";

function buildHtml(opts: {
  siteUrl: string; resultsUrl: string; eshopName: string; playersLine: string;
}): string {
  const { siteUrl, resultsUrl, eshopName, playersLine } = opts;
  return `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#4f11ff,#7c3aed);padding:32px 32px 28px;">
      <img src="${siteUrl}/performind-logo-email.png" alt="Performind Marketing" height="18" style="display:block;height:18px;width:auto;margin:0 auto 32px;border:0;">
      <h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;line-height:1.25;">
        Vaše analýza konkurence je připravená
      </h1>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">Dobrý den,</p>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
        děkujeme, že jste si přes analyza.performind.cz nechal zpracovat konkurenční analýzu pro
        <strong>${eshopName}</strong>.
      </p>
      <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.6;">
        Při prvním zpracování se na naší straně přihodil technický zádrhel a data se nenačetla —
        omlouvám se za to. Teď už je analýza kompletní a čeká na vás:
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${resultsUrl}"
           style="display:inline-block;background:#b0f221;color:#111827;text-decoration:none;font-weight:700;font-size:15px;padding:16px 36px;border-radius:12px;letter-spacing:0.01em;">
          Zobrazit analýzu →
        </a>
      </div>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
        Porovnáváme v ní vaši reklamní aktivitu na Metě s konkurencí — počty a typy reklam,
        formáty i délku běhu kampaní.${playersLine ? ` (${playersLine})` : ""}
      </p>
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
        Kdybyste chtěl výsledky probrat nebo se na cokoli zeptat, klidně odpovězte na tento e-mail.
      </p>
      <p style="margin:24px 0 0;font-size:14px;color:#374151;line-height:1.6;">
        S pozdravem,<br>Daniel Soják — Performind
      </p>
    </div>
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0;font-size:11px;color:#9ca3af;">
        © ${new Date().getFullYear()} Performind Marketing s.r.o. · Masarykova 32, 602 00 Brno
      </p>
    </div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const sessionId = body.session_id as string | undefined;
    const dryRun = body.dry_run === true;
    if (!sessionId) return err("session_id required");

    const supa = admin();
    const { data: session, error: sErr } = await supa
      .from("lm_sessions").select("*").eq("id", sessionId).maybeSingle();
    if (sErr) throw sErr;
    if (!session) return err("session not found", 404);
    if (!session.email) return err("session has no email", 400);
    if (session.status !== "ready") return err(`session not ready (status=${session.status})`, 409);

    const { data: comps } = await supa
      .from("lm_session_competitors")
      .select("position, url, ads_count").eq("session_id", sessionId).order("position");
    const players = (comps ?? []).map((c) => `${domainName(c.url)}: ${c.ads_count ?? 0}`);
    const playersLine = players.length ? `aktivní reklamy — ${players.join(", ")}` : "";

    const siteUrl = Deno.env.get("SITE_URL") ?? "https://analyza.performind.cz";
    const resultsUrl = `${siteUrl}/results/${sessionId}`;
    const eshopName = session.eshop_name || domainName(session.eshop_url ?? "") || "váš e-shop";

    const result: Record<string, unknown> = { session_id: sessionId, email: session.email, dry_run: dryRun };

    if (dryRun) {
      result.subject = SUBJECT;
      result.reply_to = REPLY_TO;
      result.players_line = playersLine;
      result.results_url = resultsUrl;
      return ok(result);
    }

    // 1) Opravný mail přes Resend
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) return err("RESEND_API_KEY not configured", 500);
    const html = buildHtml({ siteUrl, resultsUrl, eshopName, playersLine });
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [session.email],
        reply_to: [REPLY_TO],
        subject: SUBJECT,
        html,
      }),
    });
    const resendBody = await resendRes.text();
    result.email_sent = resendRes.ok;
    result.email_detail = resendRes.ok ? JSON.parse(resendBody || "{}")?.id ?? null : resendBody.slice(0, 300);
    if (!resendRes.ok) console.error("Resend error:", resendBody);

    // 2) Push kontaktu do Ecomailu (stejný payload jako pipeline syncToEcomail)
    const ECOMAIL_API_KEY = Deno.env.get("ECOMAIL_API_KEY");
    if (ECOMAIL_API_KEY) {
      const comp1 = (comps ?? []).find((c) => c.position === 1);
      const comp2 = (comps ?? []).find((c) => c.position === 2);
      const payload = {
        subscriber_data: {
          email: session.email,
          custom_fields: {
            lm_analysis_analyzed_domain: domainName(session.eshop_url ?? ""),
            lm_analysis_results_url: resultsUrl,
            lm_analysis_competitor_1: comp1 ? domainName(comp1.url) : "",
            lm_analysis_competitor_2: comp2 ? domainName(comp2.url) : "",
            lm_analysis_source_campaign: session.utm_campaign ?? "",
            lm_analysis_source_adset: session.utm_content ?? "",
            lm_analysis_source_ad: session.utm_term ?? "",
          },
          tags: ["lead-magnet-analyza"],
        },
        trigger_autoresponders: true,
        update_existing: true,
        resubscribe: false,
      };
      const ecoRes = await fetch("https://api2.ecomailapp.cz/lists/1/subscribe", {
        method: "POST",
        headers: { key: ECOMAIL_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const ecoBody = await ecoRes.text();
      result.ecomail_synced = ecoRes.ok;
      result.ecomail_detail = ecoRes.ok ? "ok" : ecoBody.slice(0, 300);
      if (!ecoRes.ok) console.error("Ecomail error:", ecoBody);
    } else {
      result.ecomail_synced = false;
      result.ecomail_detail = "ECOMAIL_API_KEY not set";
    }

    return ok(result);
  } catch (e) {
    console.error("lm-corrective-followup error:", e);
    return err((e as Error).message, 500);
  }
});
