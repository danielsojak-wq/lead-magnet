import { corsHeaders } from "../_shared/cors.ts";

// Meta Conversions API (CAPI) server-side relay.
// Veřejně volatelný (verify_jwt=false), ale GATE přes service-role key v Authorization.
// Volají ho jen jiné edge funkce (send-verification-email, verify-lm-token) server-to-server.

const PIXEL_ID = Deno.env.get("META_CAPI_PIXEL_ID") ?? "1367206901303022";

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// SHA-256 hex přes Web Crypto (NE Node crypto).
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function ipFromHeaders(req: Request): string | undefined {
  const xff = req.headers.get("x-forwarded-for");
  return xff ? xff.split(",")[0].trim() : undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── Service-role gate: bez správného keyu 401 (brání spamu falešných eventů) ──
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!serviceKey || token !== serviceKey) return json({ error: "unauthorized" }, 401);

  const accessToken = Deno.env.get("META_CAPI_ACCESS_TOKEN");
  if (!accessToken) return json({ error: "META_CAPI_ACCESS_TOKEN not configured" }, 500);

  try {
    const body = await req.json();
    const event_name: string | undefined = body.event_name;
    const event_id: string | undefined = body.event_id;
    if (!event_name || !event_id) return json({ error: "event_name and event_id required" }, 400);

    const email: string | undefined = (body.email as string | undefined)?.trim().toLowerCase() || undefined;
    const event_source_url: string | undefined = body.event_source_url;
    const event_time: number = typeof body.event_time === "number" ? body.event_time : Math.floor(Date.now() / 1000);
    const client_ip: string | undefined = (body.client_ip as string | undefined) || ipFromHeaders(req);
    const client_user_agent: string | undefined = (body.client_user_agent as string | undefined) || req.headers.get("user-agent") || undefined;
    const fbp: string | undefined = body.fbp;
    const fbc: string | undefined = body.fbc;

    // user_data — MAX MATCH: posílej vše, co je k dispozici.
    const user_data: Record<string, unknown> = {};
    if (email) user_data.em = [await sha256Hex(email)];
    if (client_ip) user_data.client_ip_address = client_ip;
    if (client_user_agent) user_data.client_user_agent = client_user_agent;
    if (fbp) user_data.fbp = fbp;
    if (fbc) user_data.fbc = fbc;

    const payload: Record<string, unknown> = {
      data: [{
        event_name,
        event_time,
        event_id,
        action_source: "website",
        ...(event_source_url ? { event_source_url } : {}),
        user_data,
      }],
      access_token: accessToken, // token v BODY, ne v URL
    };
    const testCode = Deno.env.get("META_CAPI_TEST_CODE");
    if (testCode) payload.test_event_code = testCode;

    const res = await fetch(`https://graph.facebook.com/v25.0/${PIXEL_ID}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const metaBody: any = await res.json().catch(() => ({}));

    // Non-PII log — NIKDY hashovaný email ani token.
    console.log(JSON.stringify({
      level: res.ok ? "info" : "error",
      message: "meta_capi",
      event_name,
      event_id,
      http_status: res.status,
      events_received: metaBody?.events_received ?? null,
      fbtrace_id: metaBody?.fbtrace_id ?? null,
    }));

    return json({ meta_status: res.status, meta_body: metaBody }, res.ok ? 200 : 502);
  } catch (e) {
    console.error("meta-capi error:", String(e));
    return json({ error: String(e) }, 500);
  }
});
