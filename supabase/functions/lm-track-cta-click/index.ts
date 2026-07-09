import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Tenká fire-and-forget funkce: zaznamená první klik na booking CTA na results
// dashboardu. Volá se z frontendu (fire-and-forget, neblokuje otevření booking
// odkazu). Idempotentní — nastaví booking_cta_clicked_at jen když ještě NENÍ
// (first-touch; opakované kliky nepřepisují). verify_jwt=false (volá frontend
// s anon key), konzistentní s ostatními LM funkcemi.

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = body.session_id as string | undefined;
    if (!sessionId) return json({ error: "session_id required" }, 400);

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Nastav jen tam, kde ještě není → první klik stačí, další jsou no-op.
    const { error } = await supa
      .from("lm_sessions")
      .update({ booking_cta_clicked_at: new Date().toISOString() })
      .eq("id", sessionId)
      .is("booking_cta_clicked_at", null);
    if (error) console.warn("cta track error:", error.message);

    return json({ ok: true });
  } catch (e) {
    console.error("lm-track-cta-click error:", e);
    return json({ error: String(e) }, 500);
  }
});
