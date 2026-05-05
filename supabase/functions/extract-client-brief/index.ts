import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_CHARS = 30_000;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

function bad(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function normalize(text: string): string {
  return text
    .replace(/\u0000/g, "")
    // strip control chars except newline, tab, carriage return
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function extractPdf(bytes: Uint8Array): Promise<string> {
  // unpdf works natively in Deno (no Node Buffer / fs dependencies)
  const { extractText } = await import("https://esm.sh/unpdf@0.12.1");
  const { text } = await extractText(bytes, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : String(text || "");
}

async function extractDocx(bytes: Uint8Array): Promise<string> {
  const mod: any = await import("https://esm.sh/mammoth@1.8.0?target=denonext");
  const mammoth = mod.default || mod;
  // mammoth expects { arrayBuffer } in node/browser
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const result = await mammoth.extractRawText({ arrayBuffer: ab });
  return String(result?.value || "");
}

function extractTxt(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const client_slug = String(body?.client_slug || "").trim();
    const file_name = String(body?.file_name || "").trim();
    const mime_type = String(body?.mime_type || "").trim();
    const file_base64 = String(body?.file_base64 || "");

    if (!client_slug) return bad("client_slug je povinné");
    if (!file_name) return bad("file_name je povinné");
    if (!file_base64) return bad("file_base64 je povinné");

    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(file_base64);
    } catch {
      return bad("Soubor se nepodařilo dekódovat (base64)");
    }
    if (bytes.length === 0) return bad("Soubor je prázdný");
    if (bytes.length > MAX_FILE_BYTES) return bad("Soubor je větší než 10 MB");

    const lower = file_name.toLowerCase();
    let text = "";
    try {
      if (mime_type === "application/pdf" || lower.endsWith(".pdf")) {
        text = await extractPdf(bytes);
        if (!text.trim()) return bad("PDF neobsahuje textovou vrstvu (zřejmě sken). Použij OCR nebo zkonvertuj do TXT/DOCX.");
      } else if (
        mime_type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        lower.endsWith(".docx")
      ) {
        text = await extractDocx(bytes);
      } else if (mime_type === "text/plain" || lower.endsWith(".txt") || lower.endsWith(".md")) {
        text = extractTxt(bytes);
      } else {
        return bad(`Nepodporovaný formát: ${mime_type || file_name}. Povoleno: PDF, DOCX, TXT.`);
      }
    } catch (e: any) {
      console.error("extract error", e);
      return bad("Extrakce textu selhala: " + (e?.message || String(e)), 500);
    }

    const normalized = normalize(text);
    if (!normalized) return bad("Soubor neobsahuje žádný text");

    const original_length = normalized.length;
    const truncated = original_length > MAX_CHARS;
    const final = truncated ? normalized.slice(0, MAX_CHARS) : normalized;

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error } = await supa
      .from("creative_brand_profiles")
      .upsert({
        client_slug,
        client_brief: final,
        client_brief_file_name: file_name,
        client_brief_char_count: final.length,
        client_brief_updated_at: new Date().toISOString(),
      }, { onConflict: "client_slug" });

    if (error) {
      console.error("upsert error", error);
      return bad("Uložení selhalo: " + error.message, 500);
    }

    return new Response(JSON.stringify({
      text: final,
      char_count: final.length,
      truncated,
      original_length,
      file_name,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("extract-client-brief error:", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});