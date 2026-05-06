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

function adMixBar(mix: { brand: number; sales: number; retargeting: number }) {
  const b = mix.brand || 0;
  const s = mix.sales || 0;
  const r = mix.retargeting || 0;
  return `
    <div style="display:flex;height:8px;border-radius:4px;overflow:hidden;margin:6px 0;">
      ${b > 0 ? `<div style="width:${b}%;background:#4f11ff;"></div>` : ""}
      ${s > 0 ? `<div style="width:${s}%;background:#b0f221;"></div>` : ""}
      ${r > 0 ? `<div style="width:${r}%;background:#f59e0b;"></div>` : ""}
    </div>
    <div style="font-size:11px;color:#6b7280;display:flex;gap:12px;">
      ${b > 0 ? `<span>🟣 Brand ${b}%</span>` : ""}
      ${s > 0 ? `<span>🟢 Výkon ${s}%</span>` : ""}
      ${r > 0 ? `<span>🟡 Retargeting ${r}%</span>` : ""}
    </div>`;
}

function renderMarkdownToHtml(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^### (.+)$/gm, '<h3 style="font-size:14px;font-weight:700;color:#111827;margin:16px 0 6px;">$1</h3>')
    .replace(/^- (.+)$/gm, '<li style="margin-bottom:6px;">$1</li>')
    .replace(/(<li[\s\S]*?<\/li>)+/g, '<ul style="padding-left:18px;margin:0 0 12px;">$&</ul>');
}

function buildEmailHtml({
  eshopName,
  crossSummary,
  competitors,
  resultsUrl,
}: {
  eshopName: string;
  crossSummary: string | null;
  competitors: any[];
  resultsUrl: string;
}): string {
  const competitorSections = competitors
    .map((c: any) => {
      const mix = c.ad_mix || { brand: 0, sales: 0, retargeting: 0 };
      return `
      <div style="background:#f9fafb;border-radius:12px;padding:20px;margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <strong style="font-size:15px;color:#111827;">${c.name || c.url}</strong>
          <span style="font-size:12px;color:#6b7280;">${c.ads_count} reklam</span>
        </div>
        ${adMixBar(mix)}
        ${c.summary ? `<div style="margin-top:14px;font-size:13px;color:#374151;line-height:1.6;">${renderMarkdownToHtml(c.summary)}</div>` : ""}
      </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#4f11ff,#7c3aed);padding:32px 32px 28px;">
      <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.6);margin-bottom:8px;">Performind Studio</div>
      <h1 style="margin:0;font-size:24px;font-weight:800;color:#ffffff;line-height:1.2;">
        Konkurenční analýza<br>pro ${eshopName}
      </h1>
    </div>

    <div style="padding:28px 32px;">

      <!-- Cross-summary -->
      ${crossSummary ? `
      <div style="background:#f5f3ff;border-left:3px solid #4f11ff;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#4f11ff;margin-bottom:10px;">Celkové shrnutí</div>
        <div style="font-size:13px;color:#374151;line-height:1.7;">${renderMarkdownToHtml(crossSummary)}</div>
      </div>` : ""}

      <!-- Competitors -->
      <h2 style="font-size:16px;font-weight:700;color:#111827;margin:0 0 14px;">Analýza konkurentů</h2>
      ${competitorSections || '<p style="color:#9ca3af;font-size:13px;">Žádní konkurenti nebyli analyzováni.</p>'}

      <!-- CTA -->
      <div style="text-align:center;margin-top:28px;padding-top:24px;border-top:1px solid #e5e7eb;">
        <a href="${resultsUrl}" style="display:inline-block;background:#4f11ff;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 28px;border-radius:10px;">
          Zobrazit výsledky v prohlížeči →
        </a>
        <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">
          Chcete z dat vytěžit maximum?
          <a href="https://performind.cz" style="color:#4f11ff;text-decoration:none;">Napište nám</a>
          — připravíme kreativní brief a mediální plán přímo pro vás.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0;font-size:11px;color:#9ca3af;">
        © ${new Date().getFullYear()} Performind Studio s.r.o. · Vyšehradská 1349/2, Praha 2
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

    // Fetch competitors
    const { data: competitors, error: compErr } = await supa
      .from("lm_session_competitors")
      .select("*")
      .eq("session_id", sessionId)
      .order("position");

    if (compErr) throw compErr;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? "";
    // Derive the public app URL from the Supabase project ref isn't reliable —
    // use an env var SITE_URL instead (set in Supabase dashboard secrets).
    const siteUrl = Deno.env.get("SITE_URL") ?? "https://analyza.performind.cz";
    const resultsUrl = `${siteUrl}/results/${sessionId}`;

    const html = buildEmailHtml({
      eshopName: session.eshop_name ?? "Váš e-shop",
      crossSummary: session.cross_summary ?? null,
      competitors: competitors ?? [],
      resultsUrl,
    });

    // Send via Resend
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Performind Studio <vysledek@analyza.performind.cz>",
        to: [session.email],
        subject: `Vaše konkurenční analýza — ${session.eshop_name ?? "výsledky"}`,
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
