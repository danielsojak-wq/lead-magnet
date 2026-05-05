import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const AI_TIMEOUT_MS = 25_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), ms)),
  ]);
}

function isHex(c: unknown): c is string {
  return typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c.trim());
}

function collectPalette(branding: any): string[] {
  const out = new Set<string>();
  const push = (v: any) => { if (isHex(v)) out.add(v.trim().toLowerCase()); };
  const c = branding?.colors || {};
  push(c.primary); push(c.secondary); push(c.accent);
  push(c.background); push(c.textPrimary); push(c.textSecondary);
  if (Array.isArray(c.palette)) c.palette.forEach(push);
  const comps = branding?.components || {};
  for (const k of Object.keys(comps)) {
    const v = comps[k] || {};
    push(v.background); push(v.textColor); push(v.borderColor);
  }
  return Array.from(out).slice(0, 24);
}

// HSV-ish helpers for color classification
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    switch (max) {
      case rn: h = ((gn - bn) / d) % 6; break;
      case gn: h = (bn - rn) / d + 2; break;
      case bn: h = (rn - gn) / d + 4; break;
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return [h, s, v];
}

function isVividGreen(hex: string): boolean {
  try {
    const [r, g, b] = hexToRgb(hex);
    const [h, s, v] = rgbToHsv(r, g, b);
    return h >= 80 && h <= 170 && s >= 0.45 && v >= 0.4;
  } catch { return false; }
}

function isNeutral(hex: string): boolean {
  try {
    const [r, g, b] = hexToRgb(hex);
    const [, s, v] = rgbToHsv(r, g, b);
    return s < 0.12 || v < 0.1 || v > 0.97;
  } catch { return true; }
}

function rgbStringToHex(s: string): string | null {
  const m = s.match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (!m) return null;
  const r = Math.min(255, parseInt(m[1], 10));
  const g = Math.min(255, parseInt(m[2], 10));
  const b = Math.min(255, parseInt(m[3], 10));
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toLowerCase();
}

/**
 * Extract a richer color palette from raw HTML (inline styles, <style>, CSS vars).
 * Counts occurrences so we can rank the most-used colors.
 */
function extractColorsFromHtml(html: string): { hex: string; count: number }[] {
  if (!html) return [];
  const counts = new Map<string, number>();
  const bump = (hex: string | null) => {
    if (!hex) return;
    const norm = hex.trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(norm)) return;
    counts.set(norm, (counts.get(norm) || 0) + 1);
  };
  // #RRGGBB
  for (const m of html.matchAll(/#([0-9a-fA-F]{6})\b/g)) bump(`#${m[1]}`);
  // #RGB -> expand
  for (const m of html.matchAll(/#([0-9a-fA-F]{3})(?![0-9a-fA-F])/g)) {
    const s = m[1];
    bump(`#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`);
  }
  // rgb()/rgba()
  for (const m of html.matchAll(/rgba?\([^)]+\)/gi)) bump(rgbStringToHex(m[0]));
  return Array.from(counts.entries())
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Build the candidate palette to send to the AI:
 * Firecrawl branding palette + top-N colors from HTML, with neutrals filtered.
 */
function buildCandidatePalette(branding: any, html: string): {
  palette: string[];
  htmlPalette: { hex: string; count: number }[];
} {
  const fromBranding = collectPalette(branding);
  const fromHtml = extractColorsFromHtml(html);
  const merged = new Map<string, number>();
  for (const hex of fromBranding) merged.set(hex, (merged.get(hex) || 0) + 1000); // boost branded
  for (const { hex, count } of fromHtml) {
    if (isNeutral(hex)) continue; // skip greys / blacks / whites
    merged.set(hex, (merged.get(hex) || 0) + count);
  }
  // Always include any vivid green from html even if low count
  for (const { hex } of fromHtml) {
    if (isVividGreen(hex)) merged.set(hex, (merged.get(hex) || 0) + 500);
  }
  const ranked = Array.from(merged.entries()).sort((a, b) => b[1] - a[1]).map(([h]) => h);
  return { palette: ranked.slice(0, 30), htmlPalette: fromHtml.slice(0, 40) };
}

async function pickColorsWithAI(opts: {
  apiKey: string;
  screenshotUrl?: string | null;
  palette: string[];
  fallback: { primary: string | null; secondary: string | null; accent: string | null };
}): Promise<{ primary: string | null; secondary: string | null; accent: string | null; reasoning: string | null }> {
  const { apiKey, screenshotUrl, palette, fallback } = opts;
  if (!screenshotUrl || palette.length === 0) {
    return { ...fallback, reasoning: null };
  }

  const systemPrompt =
    "Jsi senior brand stratég. Z přiloženého screenshotu webu a poskytnuté palety barev vyber 3 nejdůležitější značkové barvy podle VIZUÁLNÍ DOMINANCE (jak je vnímá návštěvník), ne podle frekvence v CSS.\n\n" +
    "- primary: nejvýraznější brand color (logo, hero, hlavní CTA tlačítka)\n" +
    "- secondary: doplňková barva (navigace, sekundární akcenty)\n" +
    "- accent: barva, která táhne pozornost (slevové badge, CTA buttony, highlights)\n\n" +
    "DŮLEŽITÉ pravidlo dominance:\n" +
    "- Pokud je v logu, košíku, hlavním CTA tlačítku, kategoriích nebo slevových badgích výrazná sytá barva (zelená, oranžová, červená, žlutá), MUSÍ být zařazena jako primary nebo accent — i když není v CSS nejčastější.\n" +
    "- Tmavě modrá v horní navigaci sama o sobě nestačí na primary, pokud existuje výraznější brand color jinde na stránce.\n" +
    "- Ignoruj neutrální barvy (bílá, černá, šedé, off-white) — ty nikdy nejsou primary/secondary/accent.\n" +
    "- Pokud paleta obsahuje sytou zelenou s vysokou saturací, je to skoro jistě brand barva e-shopu a patří do trojice.\n" +
    "Hex hodnoty MUSÍ pocházet z poskytnuté palety. Vrať POUZE platný JSON ve formátu: " +
    `{"primary":"#hex","secondary":"#hex","accent":"#hex","reasoning":"krátká věta proč"}.`;

  const userText = `Paleta barev z webu (kandidáti):\n${palette.join(", ")}`;

  const body = {
    model: "google/gemini-2.5-pro",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: userText },
          { type: "image_url", image_url: { url: screenshotUrl } },
        ],
      },
    ],
    response_format: { type: "json_object" },
  };

  try {
    const aiRes = await withTimeout(
      fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      AI_TIMEOUT_MS,
      "AI color picker",
    );
    if (!aiRes.ok) {
      const t = await aiRes.text().catch(() => "");
      console.warn("AI color picker non-ok", aiRes.status, t.slice(0, 300));
      return { ...fallback, reasoning: null };
    }
    const aiData = await aiRes.json();
    const raw = aiData?.choices?.[0]?.message?.content || "";
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } }
    }
    if (!parsed) {
      console.warn("AI color picker: unparsable response", raw.slice(0, 300));
      return { ...fallback, reasoning: null };
    }
    const norm = (v: any) => (isHex(v) ? v.trim().toLowerCase() : null);
    return {
      primary: norm(parsed.primary) || fallback.primary,
      secondary: norm(parsed.secondary) || fallback.secondary,
      accent: norm(parsed.accent) || fallback.accent,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : null,
    };
  } catch (e) {
    console.warn("AI color picker failed:", e);
    return { ...fallback, reasoning: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { client_slug, url } = await req.json();
    if (!client_slug || !url) {
      return bad("client_slug a url jsou povinné");
    }

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!FIRECRAWL_API_KEY) return bad("FIRECRAWL_API_KEY není nastaven");
    if (!LOVABLE_API_KEY) return bad("LOVABLE_API_KEY není nastaven");

    // 1. Scrape website (markdown + branding + screenshot)
    const scrapeRes = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown", "html", "branding", "screenshot"],
        onlyMainContent: false,
      }),
    });
    const scrapeData = await scrapeRes.json();
    if (!scrapeRes.ok) {
      console.error("Firecrawl error:", scrapeData);
      return bad("Firecrawl: " + (scrapeData?.error || scrapeRes.status));
    }

    const branding = scrapeData?.branding || scrapeData?.data?.branding || {};
    const markdown = (scrapeData?.markdown || scrapeData?.data?.markdown || "").slice(0, 8000);
    const html: string = scrapeData?.html || scrapeData?.data?.html || "";
    const screenshotUrl: string | null =
      scrapeData?.screenshot || scrapeData?.data?.screenshot || null;

    // 2. Tone of voice (Flash, levné)
    let toneOfVoice = "";
    try {
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: "Jsi brand stratég. Z textu webu shrň tone of voice značky v 3–5 větách česky. Popiš styl komunikace, hodnoty a typický jazyk. Neopakuj produkty.",
            },
            { role: "user", content: markdown || "(prázdný obsah)" },
          ],
        }),
      });
      const aiData = await aiRes.json();
      toneOfVoice = aiData?.choices?.[0]?.message?.content || "";
    } catch (e) {
      console.error("AI tone error:", e);
    }

    const colors = branding?.colors || {};
    const fonts = branding?.fonts || [];

    // 3. AI color picker — vybere barvy podle vizuální dominance ze screenshotu
    const { palette, htmlPalette } = buildCandidatePalette(branding, html);
    const brandingPalette = collectPalette(branding);
    const fallback = {
      primary: isHex(colors.primary) ? colors.primary.toLowerCase() : null,
      secondary: isHex(colors.secondary) ? colors.secondary.toLowerCase() : null,
      accent: isHex(colors.accent) ? colors.accent.toLowerCase() : null,
    };
    const picked = await pickColorsWithAI({
      apiKey: LOVABLE_API_KEY,
      screenshotUrl,
      palette,
      fallback,
    });

    // 3b. Safety net — pokud paleta obsahuje výraznou zelenou a AI ji nezařadila, dosadíme ji jako accent.
    let autoCorrection: string | null = null;
    const pickedColors = [picked.primary, picked.secondary, picked.accent].filter(Boolean) as string[];
    const containsVividGreen = pickedColors.some((c) => isVividGreen(c));
    if (!containsVividGreen) {
      const greenCandidate =
        htmlPalette.find((c) => isVividGreen(c.hex))?.hex ||
        palette.find((c) => isVividGreen(c)) ||
        null;
      if (greenCandidate) {
        if (!picked.accent || isNeutral(picked.accent)) {
          picked.accent = greenCandidate;
        } else if (!picked.primary || isNeutral(picked.primary)) {
          picked.primary = greenCandidate;
        } else {
          picked.accent = greenCandidate;
        }
        autoCorrection = `Detekovali jsme výraznou zelenou ${greenCandidate} jako brand barvu — automaticky doplněna.`;
      }
    }

    const reasoningWithCorrection = autoCorrection
      ? [picked.reasoning, autoCorrection].filter(Boolean).join(" ")
      : picked.reasoning;

    const profile = {
      primary_color: picked.primary,
      secondary_color: picked.secondary,
      accent_color: picked.accent,
      font_family: Array.isArray(fonts) && fonts[0]?.family ? fonts[0].family : null,
      tone_of_voice: toneOfVoice || null,
      scraped_data: {
        branding,
        source_url: url,
        scraped_at: new Date().toISOString(),
        ai_color_reasoning: reasoningWithCorrection,
        ai_color_palette: palette,
        ai_color_branding_palette: brandingPalette,
        ai_color_html_palette: htmlPalette,
        ai_color_auto_correction: autoCorrection,
        screenshot_url: screenshotUrl,
      },
    };

    // 4. Persist (upsert)
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await supa.from("creative_brand_profiles").upsert(
      { client_slug, ...profile },
      { onConflict: "client_slug" },
    );

    return new Response(JSON.stringify({ profile }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("analyze-brand-dna error:", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function bad(msg: string) {
  return new Response(JSON.stringify({ error: msg }), {
    status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
