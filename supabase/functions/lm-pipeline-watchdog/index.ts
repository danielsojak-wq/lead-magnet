import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Watchdog: dožene pipeline i v případě, kdy self-poll driver ve start-lm-analysis
// umřel na 150s task limitu A uživatel má zavřený tab (žádný frontend poll). Cron
// (pg_net → tato funkce, viz migrace 20260702180000) ji volá každou minutu a pro
// každou nedokončenou session zavolá poll-lm-pipeline (idempotentní, atomické claimy).
//
// GATED: cron se spustí až po povolení pg_cron + pg_net na projektu. Do té doby je
// funkce volatelná ručně/externě (např. GitHub Action) — logika je nezávislá na cronu.

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}
function ok(d: unknown) {
  return new Response(JSON.stringify(d), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Nedokončené stavy, které poll-lm-pipeline umí posunout dál.
const NON_TERMINAL = ["processing", "scraping", "analyzing"];
// Nesahej na úplně čerstvé (driver je stíhá) ani na prastaré (dead, ať necyklíme).
const MIN_AGE_SEC = 20;
const MAX_AGE_MIN = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const base = Deno.env.get("SUPABASE_URL");
  const key  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !key) return ok({ error: "env not configured" });

  const supa = admin();
  const nowMs = Date.now();

  const { data: stale, error } = await supa
    .from("lm_sessions")
    .select("id, status, created_at")
    .in("status", NON_TERMINAL)
    .lt("created_at", new Date(nowMs - MIN_AGE_SEC * 1000).toISOString())
    .gt("created_at", new Date(nowMs - MAX_AGE_MIN * 60_000).toISOString());

  if (error) { console.error("watchdog query error:", error.message); return ok({ error: error.message }); }

  const sessions = stale ?? [];
  console.log(JSON.stringify({ level: "info", message: "watchdog_tick", stale: sessions.length }));

  const results = await Promise.all(sessions.map(async (s) => {
    try {
      const res = await fetch(`${base}/functions/v1/poll-lm-pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, apikey: key },
        body: JSON.stringify({ session_id: s.id }),
      });
      const d = await res.json().catch(() => ({}));
      return { session_id: s.id, from: s.status, to: d?.status ?? null };
    } catch (e) {
      console.error(`watchdog poll failed for ${s.id}:`, e);
      return { session_id: s.id, from: s.status, to: "error" };
    }
  }));

  return ok({ ok: true, driven: results.length, results });
});
