import { corsHeaders } from "../_shared/cors.ts";

// ── track-capi ──────────────────────────────────────────────────────────────
// Tenká proxy pro KLIENTSKÉ Meta CAPI eventy, které nemají vlastní edge funkci
// (např. form_submitted → InitiateCheckout, klik před email gate je čistě klientský).
// Klient (anon) nemůže volat meta-capi přímo — ta má service-role gate. Tahle funkce
// je anon-callable (verify_jwt=false) a server-side zavolá meta-capi se service-role,
// takže service-role klíč zůstává skrytý a gate meta-capi se neotevírá.
//
// Bezpečnost: WHITELIST event_name — z klienta smí přijít jen horní-funnel eventy
// (InitiateCheckout). Lead / CompleteRegistration / Purchase se přes tuhle cestu
// poslat NEDAJÍ (chrání měření před spoofingem); ty mají vlastní ověřené flow.

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Eventy, které klient smí střílet přes tuhle proxy.
const ALLOWED_EVENTS = new Set(["InitiateCheckout"]);

function ipFromHeaders(req: Request): string | undefined {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const event_name: string | undefined = body.event_name;
    const event_id: string | undefined = body.event_id;

    // Symetrie s Lead/CR: bez event_id se nestřílí (bezpečný přechod). Whitelist event_name.
    if (!event_id || !event_name || !ALLOWED_EVENTS.has(event_name)) {
      return json({ ok: false, skipped: true });
    }

    const fbp: string | undefined = body.fbp || undefined;
    const fbc: string | undefined = body.fbc || undefined;
    const event_source_url: string | undefined = body.event_source_url || undefined;
    // IP/UA bereme z požadavku KLIENTA a předáváme explicitně — meta-capi je voláno
    // server-server, takže by jinak vidělo IP tohoto serveru, ne návštěvníka.
    const client_ip = ipFromHeaders(req);
    const client_user_agent = req.headers.get("user-agent") || undefined;

    // Proxy → meta-capi (service-role server-side). Fire-and-forget, neblokuje odpověď.
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/meta-capi`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify({ event_name, event_id, event_source_url, fbp, fbc, client_ip, client_user_agent }),
    }).catch((e) => console.error("track-capi → meta-capi failed:", String(e)));

    return json({ ok: true });
  } catch (e) {
    // Nikdy nerozbít klientský flow — vrať 200 i při chybě.
    console.error("track-capi error:", String(e));
    return json({ ok: false }, 200);
  }
});
