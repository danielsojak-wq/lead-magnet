import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// JSZip via esm.sh
import JSZip from "https://esm.sh/jszip@3.10.1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { brief_id, asset_ids } = await req.json();
    if (!brief_id) throw new Error("brief_id required");

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: brief, error: bErr } = await supa.from("creative_briefs").select("*").eq("id", brief_id).single();
    if (bErr) throw bErr;

    let q = supa
      .from("creative_assets")
      .select("id, variant_id, raw_image_path, composed_image_path, copy_headline, copy_body, copy_cta, status, creative_brief_variants!inner(brief_id, name, format)")
      .eq("creative_brief_variants.brief_id", brief_id);
    if (Array.isArray(asset_ids) && asset_ids.length > 0) {
      q = q.in("id", asset_ids);
    }
    const { data: assets, error: aErr } = await q;
    if (aErr) throw aErr;

    const zip = new JSZip();
    let copyText = `Brief: ${brief.name}\nKlient: ${brief.client_slug}\nVytvořeno: ${brief.created_at}\n\n`;
    let idx = 0;
    for (const a of assets || []) {
      idx++;
      const v = (a as any).creative_brief_variants;
      const folder = `${(v?.name || "varianta").replace(/[^\p{L}\p{N}\-_ ]/gu, "")}_${v?.format || ""}`.trim();
      const path = a.composed_image_path || a.raw_image_path;
      if (path) {
        const { data: file } = await supa.storage.from("creative-assets").download(path);
        if (file) {
          const buf = new Uint8Array(await file.arrayBuffer());
          const ext = path.split(".").pop() || "png";
          zip.file(`${folder}/${String(idx).padStart(2, "0")}.${ext}`, buf);
        }
      }
      copyText += `--- ${folder} #${idx} ---\n`;
      if (a.copy_headline) copyText += `Headline: ${a.copy_headline}\n`;
      if (a.copy_body) copyText += `Body: ${a.copy_body}\n`;
      if (a.copy_cta) copyText += `CTA: ${a.copy_cta}\n`;
      copyText += `\n`;
    }
    zip.file("copy.txt", copyText);

    const blob = await zip.generateAsync({ type: "uint8array" });
    const exportPath = `${brief.client_slug}/${brief.id}/exports/export-${Date.now()}.zip`;
    const up = await supa.storage.from("creative-assets").upload(exportPath, blob, {
      contentType: "application/zip", upsert: true,
    });
    if (up.error) throw up.error;

    const { data: signed } = await supa.storage.from("creative-assets").createSignedUrl(exportPath, 60 * 30);
    return new Response(JSON.stringify({ url: signed?.signedUrl, count: (assets || []).length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("export-creative-zip error:", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});