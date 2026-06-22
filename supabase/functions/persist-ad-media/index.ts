import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Stáhne náhledové obrázky (postery) reklam dané session z Meta fbcdn a uloží je
// trvale do veřejného bucketu lm-ad-media; přepíše lm_session_ads.image_url na naši
// public URL. Řeší expiraci fbcdn podpisů (~dny). video_url nechává být.
//
// Spouští se fire-and-forget z poll-lm-pipeline po dokončení scrapu. Idempotentní
// a re-spustitelná: už migrované řádky (image_url míří do našeho Storage) přeskočí.

const BUCKET = "lm-ad-media";
const CONCURRENCY = 6;

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
function ok(d: unknown) {
  return new Response(JSON.stringify(d), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function err(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function extFromContentType(ct: string | null): string {
  if (!ct) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  return "jpg";
}

async function processAd(
  supa: ReturnType<typeof admin>,
  sessionId: string,
  ad: { id: string; ad_archive_id: string | null; image_url: string | null },
): Promise<"migrated" | "skipped" | "failed"> {
  const src = ad.image_url;
  if (!src || src.includes(`/${BUCKET}/`)) return "skipped"; // nic ke stažení / už migrováno
  try {
    const res = await fetch(src, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return "failed"; // nejspíš expirované fbcdn
    const ct = res.headers.get("content-type");
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0) return "failed";
    const key = (ad.ad_archive_id || ad.id).replace(/[^a-zA-Z0-9_-]/g, "");
    const path = `${sessionId}/${key}.${extFromContentType(ct)}`;
    const up = await supa.storage.from(BUCKET).upload(path, bytes, {
      contentType: ct || "image/jpeg",
      upsert: true,
    });
    if (up.error) { console.error("upload error", up.error.message); return "failed"; }
    const publicUrl = supa.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const { error: updErr } = await supa.from("lm_session_ads")
      .update({ image_url: publicUrl }).eq("id", ad.id);
    if (updErr) { console.error("db update error", updErr.message); return "failed"; }
    return "migrated";
  } catch (e) {
    console.error("processAd error", String(e));
    return "failed";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { session_id } = await req.json().catch(() => ({}));
    if (!session_id) return err("session_id required");
    const supa = admin();

    const { data: ads, error } = await supa
      .from("lm_session_ads")
      .select("id, ad_archive_id, image_url")
      .eq("session_id", session_id);
    if (error) return err(error.message, 500);

    const todo = (ads ?? []).filter(a => a.image_url && !a.image_url.includes(`/${BUCKET}/`));
    const counts = { migrated: 0, skipped: (ads?.length ?? 0) - todo.length, failed: 0 };

    // Dávky s omezenou souběžností (download + upload), ať to drží tempo bez přetížení.
    for (let i = 0; i < todo.length; i += CONCURRENCY) {
      const chunk = todo.slice(i, i + CONCURRENCY);
      const results = await Promise.all(chunk.map(a => processAd(supa, session_id, a)));
      for (const r of results) counts[r]++;
    }

    console.log(JSON.stringify({ level: "info", message: "persist_ad_media_done", session_id, ...counts }));
    return ok({ session_id, ...counts });
  } catch (e) {
    return err(String(e), 500);
  }
});
