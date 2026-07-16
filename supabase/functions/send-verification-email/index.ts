import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  normalizeEmail,
  normalizeDomain,
  extractIp,
  checkRateLimit,
  buildRateLimitResponse,
  logRateEvent,
} from "../_shared/rate-limits.ts";
import { isDisposableEmail } from "../_shared/disposable-domains.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://analyza.performind.cz";
const TEST_EMAILS = ["daniel.sojak@performind.cz"];

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
function rateLimited(message: string, retry_after_hours: number, limit_type: string, period: string) {
  return new Response(
    JSON.stringify({ error: "rate_limit", message, retry_after_hours, limit_type, period }),
    { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
// Strukturovaný kód (ne generický err) — frontend podle něj pozná, že opakování nepomůže,
// a zobrazí konkrétní hlášku místo "Zkuste to prosím znovu".
function disposableEmail() {
  return new Response(
    JSON.stringify({
      error: "disposable_email",
      message: "Zadejte prosím firemní nebo osobní e-mail — jednorázové schránky nepodporujeme.",
    }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

function buildEmailHtml(verifyUrl: string): string {
  return `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

    <div style="background:linear-gradient(135deg,#4f11ff,#7c3aed);padding:32px 32px 28px;">
      <img src="${SITE_URL}/performind-logo-email.png" alt="Performind Marketing" height="18" style="display:block;height:18px;width:auto;margin:0 auto 32px;border:0;">
      <h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;line-height:1.25;">
        Ověřte email a spusťte analýzu vaší konkurence zdarma
      </h1>
    </div>

    <div style="padding:32px;">
      <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">Dobrý den,</p>
      <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.6;">
        Klikněte na tlačítko níže. Email ověříme a vaše analýza se <strong>automaticky spustí</strong>.
        Odkaz je platný <strong>24 hodin</strong>.
      </p>

      <div style="text-align:center;margin:32px 0;">
        <a href="${verifyUrl}"
           style="display:inline-block;background:#b0f221;color:#111827;text-decoration:none;font-weight:700;font-size:15px;padding:16px 36px;border-radius:12px;letter-spacing:0.01em;">
          Ověřit email a spustit analýzu →
        </a>
      </div>

      <div style="background:#f9fafb;border-radius:10px;padding:16px 20px;margin-top:24px;">
        <p style="margin:0 0 12px;font-size:13px;color:#374151;line-height:1.6;">
          Proskenujeme každou aktivní reklamu vašich 2 hlavních konkurentů, vyhodnotíme strategii a najdeme mezery, které můžete využít.
        </p>
        <ul style="margin:0;padding:0 0 0 16px;font-size:13px;color:#6b7280;line-height:1.8;">
          <li>Hotovo do 5 minut</li>
          <li>1× ZDARMA</li>
          <li>Konkrétní doporučení, ne teorie</li>
        </ul>
      </div>

      <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
        Pokud jste o analýzu nežádali, tento email ignorujte.<br>
        Odkaz: <a href="${verifyUrl}" style="color:#4f11ff;word-break:break-all;">${verifyUrl}</a>
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
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) return err("RESEND_API_KEY not configured", 500);

    const body = await req.json();
    const email = (body.email as string | undefined)?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err("Neplatný email");

    // Jednorázové schránky ven — ZÁMĚRNĚ hned tady, před založením session i před
    // CAPI Lead eventem. Double opt-in je nechytí (temp mailbox odkaz přijme a klikne).
    if (isDisposableEmail(email)) {
      console.log(JSON.stringify({
        level: "info", message: "disposable_email_blocked", domain: email.split("@")[1],
      }));
      return disposableEmail();
    }

    // ── Honeypot — silent fake success so bots don't know they were detected ──
    if ((body.website as string | undefined)?.trim()) {
      return ok({ ok: true, session_id: crypto.randomUUID() });
    }

    const eshop_url: string | undefined = body.eshop_url;
    const eshop_meta_url: string | undefined = body.eshop_meta_url;
    const eshop_fb_slug: string | undefined = body.eshop_fb_slug;
    const competitors: Array<{ url: string; meta_url?: string; fb_slug?: string; position: number }> = body.competitors ?? [];

    // ── Meta CAPI Lead — matching data + sdílené event_id (z klienta) ──
    const lead_event_id: string | undefined = body.lead_event_id;
    const fbp: string | null = (body.fbp as string | undefined) ?? null;
    const fbc: string | null = (body.fbc as string | undefined) ?? null;
    const event_source_url: string | undefined = body.event_source_url;

    // ── Meta ad attribution — UTM z landing page (utm_term={{ad.name}} apod.) ──
    const utm = (body.utm ?? {}) as Record<string, unknown>;
    const utmStr = (k: string): string | null =>
      typeof utm[k] === "string" && (utm[k] as string).length > 0 ? (utm[k] as string) : null;
    const landingUrl = typeof body.landing_url === "string" && body.landing_url.length > 0
      ? (body.landing_url as string) : null;
    // Ad ID atribuce — utm_ad_id={{ad.id}} z URL parametrů reklamy. Immutable klíč
    // DB ↔ Meta Ads Manager: utm_term nese {{ad.name}}, který Meta zamrazí při
    // prvním zveřejnění, takže duplikovaná + přejmenovaná reklama posílá navždy
    // starý název (hsa_ad je literál kopírovaný duplikací — taky nespolehlivý).
    // Fallback z landing_url pokrývá starší build frontendu bez utm_ad_id capture.
    const metaAdId = utmStr("utm_ad_id")
      ?? landingUrl?.match(/[?&]utm_ad_id=([0-9]+)/)?.[1]
      ?? null;
    const utmFields = {
      utm_source: utmStr("utm_source"),
      utm_medium: utmStr("utm_medium"),
      utm_campaign: utmStr("utm_campaign"),
      utm_content: utmStr("utm_content"),
      utm_term: utmStr("utm_term"),
      meta_ad_id: metaAdId,
      landing_url: landingUrl,
    };

    // IP/UA UŽIVATELE (z jeho requestu na tuhle fn), ne ze server-to-server CAPI callu.
    const client_ip: string | null = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const client_user_agent: string | null = req.headers.get("user-agent") ?? null;

    const supa = admin();

    // ── Rate limit CHECK (skip for test emails) ────────────────────────────────
    if (!TEST_EMAILS.includes(email)) {
      const ip = extractIp(req);
      const domain = normalizeDomain(eshop_url ?? "");

      const hit = await checkRateLimit(supa, { ip, email, domain });
      if (hit) {
        const { message, retry_after_hours } = buildRateLimitResponse(hit);
        logRateEvent({
          level: "warn",
          message: "rate_limit_blocked",
          identifier_type: hit.layer,
          identifier_value: hit.layer === "email" ? email : hit.layer === "ip" ? ip : domain,
          limit_hit: true,
        });
        return rateLimited(message, retry_after_hours, hit.layer, hit.period);
      }
    }

    // ── Existing session logic ─────────────────────────────────────────────────

    const { data: existing } = await supa
      .from("lm_sessions")
      .select("id, status, lead_event_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, meta_ad_id, landing_url")
      .eq("email", email)
      .maybeSingle();

    let sessionId: string;
    let token: string;

    // Idempotence: Lead střílíme jen když session ještě nemá lead_event_id.
    const alreadyFiredLead = !!existing?.lead_event_id && !TEST_EMAILS.includes(email);
    const captureLead = lead_event_id && !alreadyFiredLead
      ? { lead_event_id, fbp, fbc, client_ip, client_user_agent }
      : {};

    // First-touch: UTM atribuci zapiš JEN do sloupce, který je zatím prázdný
    // (null/""). Jednou zachycená reklama se už nikdy nepřepíše — a null z
    // organického resubmitu nikdy nesmaže existující hodnotu.
    const existingUtm = existing as Record<string, unknown> | null;
    const utmUpdate = Object.fromEntries(
      Object.entries(utmFields).filter(([k, v]) => {
        if (v === null) return false;                       // příchozí prázdné → nesahat
        const cur = existingUtm?.[k];
        return cur === null || cur === undefined || cur === ""; // jen do prázdného = first-touch
      }),
    );

    const nonResettableStatuses = ["urls_pending", "processing", "ready", "failed"];
    if (existing && nonResettableStatuses.includes(existing.status) && !TEST_EMAILS.includes(email)) {
      return ok({ ok: true, already_verified: true });
    }

    if (existing && TEST_EMAILS.includes(email)) {
      await supa.from("lm_sessions").delete().eq("id", existing.id);
    }

    if (existing && !TEST_EMAILS.includes(email)) {
      const newToken = crypto.randomUUID();
      await supa
        .from("lm_sessions")
        .update({
          verification_token: newToken,
          token_expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          eshop_url: eshop_url ?? null,
          eshop_meta_library_url: eshop_meta_url ?? null,
          eshop_fb_slug: eshop_fb_slug ?? null,
          ...captureLead,
          ...utmUpdate,
        })
        .eq("id", existing.id);
      sessionId = existing.id;
      token = newToken;

      await supa.from("lm_session_competitors").delete().eq("session_id", sessionId);
    } else {
      const { data: created, error: insertErr } = await supa
        .from("lm_sessions")
        .insert({
          email,
          eshop_url: eshop_url ?? null,
          eshop_meta_library_url: eshop_meta_url ?? null,
          eshop_fb_slug: eshop_fb_slug ?? null,
          ...captureLead,
          ...utmFields,
        })
        .select()
        .single();
      if (insertErr || !created) return err(insertErr?.message ?? "DB error", 500);
      sessionId = created.id;
      token = created.verification_token;
    }

    if (competitors.length > 0) {
      await supa.from("lm_session_competitors").insert(
        competitors.map((c) => ({
          session_id: sessionId,
          position: c.position,
          url: c.url,
          meta_library_url: c.meta_url ?? null,
          fb_slug: c.fb_slug ?? null,
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

    // ── Meta CAPI Lead (dual-fire s GTM Pixelem, sdílené event_id) ──
    // Idempotence: jen poprvé (když jsme teď uložili lead_event_id). Non-blocking.
    if (lead_event_id && !alreadyFiredLead) {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/meta-capi`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
        body: JSON.stringify({
          event_name: "Lead",
          event_id: lead_event_id,
          event_source_url: event_source_url ?? SITE_URL,
          email,
          fbp, fbc, client_ip, client_user_agent,
        }),
      }).catch((e) => console.error("meta-capi Lead failed:", String(e)));
    }

    return ok({ ok: true, session_id: sessionId });
  } catch (e) {
    console.error("send-verification-email error:", e);
    return err((e as Error).message, 500);
  }
});
