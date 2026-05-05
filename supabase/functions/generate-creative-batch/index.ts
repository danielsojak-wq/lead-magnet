import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TEXT_MODEL = "google/gemini-2.5-pro";
const IMAGE_MODEL = "google/gemini-3.1-flash-image-preview";
const VISION_MODEL = "google/gemini-2.5-flash";

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function aiCall(payload: any, apiKey: string) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AI gateway ${res.status}: ${txt.slice(0, 300)}`);
  }
  return res.json();
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("invalid data URL");
  const mime = m[1];
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

async function generateCopy(brief: any, variant: any, brand: any, inspirationText: string, apiKey: string) {
  const sys = `Jsi senior copywriter pro performance marketing. Píšeš v češtině, krátce, úderně a bez emoji. Vracej VÝHRADNĚ JSON pole bez komentáře, ve tvaru: [{"headline":"...","body":"...","cta":"..."}]. Body max 140 znaků, headline max 60 znaků, cta max 25 znaků.
POVINNÁ pravidla pro headline:
- NIKDY nepoužij samotný název značky jako headline ("Re-Biom?", "Acme!"). Headline musí komunikovat KONKRÉTNÍ benefit, problém, nebo háček.
- Každá z N variant musí být VÝRAZNĚ jiná - jiný úhel, jiné slovo na začátku, jiná délka. Žádné duplicity ani parafráze.
- Vycházej z REÁLNÝCH claimů a benefitů z přiloženého obsahu landing page (čísla, složení, výsledek).${inspirationText ? "\nPOVINNĚ se silně inspiruj přiloženými referencemi konkurence – přejmi jejich strukturu nabídky, typ háčku, formát CTA a tonalitu (zejména u prodejních reklam). NEKOPÍRUJ doslovně, ale výsledek musí být zjevně inspirován jejich stylem." : ""}`;
  const landingMd = (brief.scraped_context?.markdown_excerpt || brief.scraped_context?.summary || "").slice(0, 4000);
  const clientBrief = (brand?.client_brief || "").slice(0, 30_000);
  const usr = `Brand: ${brief.client_slug}
Tone of voice: ${brand?.tone_of_voice || "(neuvedeno)"}
${clientBrief ? `=== KLIENTSKÝ BRIEF (klíčový kontext o značce, produktu a komunikaci — respektuj!) ===\n${clientBrief}\n=== KONEC KLIENTSKÉHO BRIEFU ===\n` : ""}
Kampaň: ${brief.name}
USP: ${brief.usp || "-"}
Claim: ${brief.claim || "-"}
Cíl: ${brief.goal || "-"}
Cílovka: ${brief.audience || "-"}
Produkt/kontext: ${brief.product_context || "(neuvedeno)"}
=== OBSAH LANDING PAGE (zdroj pravdy o produktu, použij konkrétní fakta) ===
${landingMd || "(nedostupné)"}
=== KONEC ===
Varianta: ${variant.name} (formát ${variant.format}, úhel ${variant.angle || "-"})
Poznámka: ${variant.note || "-"}
${inspirationText ? `\n=== INSPIRACE (POVINNÉ ZDROJE STYLU) ===\nPoužij tyto reference jako hlavní vodítko pro tón, strukturu, typ háčku a formát nabídky. Pokud jsou v nich slevy/akce/čísla, replikuj jejich přístup s daty této značky. NEKOPÍRUJ doslovně.\n${inspirationText}\n=== KONEC INSPIRACE ===\n` : ""}
Vygeneruj přesně ${variant.copy_count} VÝRAZNĚ ODLIŠNÝCH kreativ. Každá s jiným headline, jiným začátkem, jiným úhlem.`;

  const data = await aiCall({
    model: TEXT_MODEL,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: usr },
    ],
  }, apiKey);
  const raw = data?.choices?.[0]?.message?.content || "[]";
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try {
    const arr = JSON.parse(cleaned);
    return Array.isArray(arr) ? arr : [];
  } catch {
    const m = cleaned.match(/\[[\s\S]*\]/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return [];
  }
}

async function generateImage(brief: any, variant: any, brand: any, imagePromptHint: string, inspirationVisualHint: string, productImageUrl: string | null, apiKey: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const colorHint = [brand?.primary_color, brand?.secondary_color, brand?.accent_color].filter(Boolean).join(", ");
  const productContext = brief.product_context || imagePromptHint || "";
  const webSummary = (brief.scraped_context?.summary || "").slice(0, 800);
  const angleMood: Record<string, string> = {
    "emocionalni": "teplá, lidská, intimní atmosféra, měkké světlo",
    "racionalni": "čistá produktová kompozice, denní světlo, technický důraz",
    "urgence": "dynamický záběr, kontrastní světlo, akční pocit",
    "socialni-dukaz": "scéna se spokojenými lidmi v reálném prostředí",
    "edukacni": "instruktážní záběr s jasným fokusem na použití produktu",
    "humor": "lehce odlehčená, hravá scéna, pastelové tóny",
  };
  const mood = angleMood[variant.angle || ""] || "profesionální komerční fotografie";
  const referenceMode = !!productImageUrl;
  const prompt = referenceMode
    ? `KRITICKÉ ZADÁNÍ: Vezmi PŘESNĚ produkt z přiložené referenční fotografie a umísti ho do nové scény.
Produkt MUSÍ vypadat IDENTICKY jako na referenci: stejný tvar lahvičky/obalu, stejná barva obalu, stejná etiketa, stejné logo a stejný text na produktu. NEMĚŇ design produktu ani obalu, NEMĚŇ etiketu, NEMĚŇ název.
Nová scéna: ${productContext || "autentický kontext použití produktu"}.
Vizuální nálada: ${mood}. Formát ${variant.format}.
${inspirationVisualHint ? `Vizuální inspirace pro kompozici, světlo a paletu (ale NIKDY neměň design produktu): ${inspirationVisualHint}.\n` : ""}${colorHint ? `Akcentní paleta prostředí: ${colorHint}. ` : ""}
Kompozice: produkt v popředí jasně viditelný, ponech volné místo v levé horní třetině pro pozdější textový overlay.
ABSOLUTNÍ ZÁKAZ: žádný NOVÝ vykreslený text mimo produkt (text na etiketě produktu zachovat), žádné nové logo, žádný overlay, vodoznak, UI prvky, rámečky.
Cílová skupina: ${brief.audience || "obecná"}.
Styl: high-end komerční fotografie, ostré detaily, realistické osvětlení, žádný 3D render look.`
    : `Fotorealistická reklamní fotografie ve formátu ${variant.format} pro značku "${brief.client_slug}".
POVINNÝ obsah scény (musí být na obrázku jasně vidět): ${productContext || "produkt/služba klienta v autentickém kontextu jeho použití"}.
Kontext značky z webu: ${webSummary || "(viz produktový kontext)"}.
Kampaň: "${brief.name}"${brief.usp ? ", USP: " + brief.usp : ""}.
Vizuální nálada: ${mood}.
${inspirationVisualHint ? `POVINNÁ vizuální inspirace (replikuj kompozici, světlo, paletu a typ záběru z těchto referencí, ale s produktem této značky): ${inspirationVisualHint}.\n` : ""}
${colorHint ? "Akcentní barevná paleta inspirovaná brand barvami: " + colorHint + ". " : ""}
Kompozice: ponech volný negativní prostor v levé horní třetině pro pozdější textový overlay (žádný text na obraze).
ABSOLUTNÍ ZÁKAZ: žádný vykreslený text, žádná písmena, žádná loga, žádné vodoznaky, žádné UI prvky, žádné rámečky.
Cílová skupina: ${brief.audience || "obecná"}.
Styl: high-end komerční fotografie, ostré detaily, realistické osvětlení, žádný 3D render look.`;

  const userContent = referenceMode
    ? [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: productImageUrl } },
      ]
    : prompt;

  const data = await aiCall({
    model: IMAGE_MODEL,
    messages: [{ role: "user", content: userContent as any }],
    modalities: ["image", "text"],
  }, apiKey);
  const url: string | undefined = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) return null;
  return dataUrlToBytes(url);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { brief_id, only_missing } = await req.json();
    if (!brief_id) {
      return new Response(JSON.stringify({ error: "brief_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const supa = admin();
    const [briefRes, variantsRes] = await Promise.all([
      supa.from("creative_briefs").select("*").eq("id", brief_id).single(),
      supa.from("creative_brief_variants").select("*").eq("brief_id", brief_id).order("position"),
    ]);
    if (briefRes.error) throw briefRes.error;
    if (variantsRes.error) throw variantsRes.error;
    const brief = briefRes.data;
    const variants = variantsRes.data || [];

    const { data: brand } = await supa
      .from("creative_brand_profiles")
      .select("*")
      .eq("client_slug", brief.client_slug)
      .maybeSingle();

    // Načti vybrané konkurenční reklamy jako inspiraci
    const { data: inspirationLinks } = await supa
      .from("creative_brief_inspirations")
      .select("competitor_ad_id")
      .eq("brief_id", brief_id);
    const inspirationIds = (inspirationLinks || []).map((r: any) => r.competitor_ad_id);
    let inspirationAds: any[] = [];
    if (inspirationIds.length > 0) {
      const { data: ads } = await supa
        .from("competitor_ads")
        .select("page_name, primary_text, cta_text, ad_type, image_url")
        .in("id", inspirationIds)
        .limit(6);
      inspirationAds = ads || [];
    }
    const inspirationText = inspirationAds.map((a, i) =>
      `${i + 1}. [${a.ad_type || "?"}] ${a.page_name || "?"} | CTA: ${a.cta_text || "—"} | Text: ${(a.primary_text || "").slice(0, 500)}`
    ).join("\n");
    console.log(`Loaded ${inspirationAds.length} inspiration ads for brief ${brief_id}`);

    // Run async — don't block client
    // @ts-ignore EdgeRuntime
    EdgeRuntime.waitUntil((async () => {
      try {
        // Optional: scrape landing/website for richer product context (one-shot per brief)
        if (!brief.scraped_context?.summary && (brief.landing_url || brief.website_url)) {
          try {
            const targetUrl = brief.landing_url || brief.website_url;
            const fcKey = Deno.env.get("FIRECRAWL_API_KEY");
            if (fcKey) {
              const fc = await fetch("https://api.firecrawl.dev/v2/scrape", {
                method: "POST",
                headers: { Authorization: `Bearer ${fcKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ url: targetUrl, formats: ["markdown", "summary"], onlyMainContent: true }),
              });
              const fcd = await fc.json();
              const summary = fcd?.summary || fcd?.data?.summary || (fcd?.markdown || fcd?.data?.markdown || "").slice(0, 2000);
              const scraped = { summary, source_url: targetUrl, scraped_at: new Date().toISOString() };
              brief.scraped_context = scraped;
              await supa.from("creative_briefs").update({ scraped_context: scraped }).eq("id", brief.id);
            }
          } catch (e) { console.error("scrape ctx err", e); }
        }

        // Derive a short visual hint from product_context + scraped summary
        let visualHint = brief.product_context || "";
        if (!visualHint && brief.scraped_context?.summary) {
          try {
            const v = await aiCall({
              model: VISION_MODEL,
              messages: [
                { role: "system", content: "Vrať JEDINOU větu (max 25 slov) v češtině popisující VIZUÁLNÍ scénu pro reklamu produktu. Žádné CTA, žádný text, jen popis scény (objekty, prostředí, nálada). Bez uvozovek." },
                { role: "user", content: `Brand: ${brief.client_slug}\nKampaň: ${brief.name}\nUSP: ${brief.usp || "-"}\nObsah webu:\n${(brief.scraped_context.summary || "").slice(0, 3000)}` },
              ],
            }, apiKey);
            visualHint = (v?.choices?.[0]?.message?.content || "").trim();
          } catch (e) { console.error("visual hint err", e); }
        }

        // Vizuální popis inspiračních reklam přes vision model (1-2 věty)
        let inspirationVisualHint = "";
        const inspoImages = inspirationAds
          .map((a) => a.image_url)
          .filter((u): u is string => !!u && /^https?:\/\//.test(u))
          .slice(0, 4);
        if (inspoImages.length > 0) {
          try {
            const v = await aiCall({
              model: VISION_MODEL,
              messages: [
                { role: "system", content: "Vrať 3–4 věty v češtině, které DETAILNĚ popisují společný vizuální styl těchto reklam: konkrétní typ kompozice (např. close-up, široký záběr, flat lay), směr a tvrdost světla, dominantní barevnou paletu (s konkrétními barvami), atmosféru a styl záběru (lifestyle/produktový/studio). Buď konkrétní, ne obecný. Bez uvozovek, bez zmínek o textu nebo logách." },
                { role: "user", content: [
                  { type: "text", text: "Reference konkurence:" },
                  ...inspoImages.map((url) => ({ type: "image_url", image_url: { url } })),
                ] },
              ],
            }, apiKey);
            inspirationVisualHint = (v?.choices?.[0]?.message?.content || "").trim();
            console.log("inspirationVisualHint:", inspirationVisualHint);
          } catch (e) { console.error("inspiration visual hint err", e); }
        }

        for (const variant of variants) {
          const target = Math.max(variant.copy_count, variant.image_count);
          let existing = 0;
          if (only_missing) {
            const { count } = await supa
              .from("creative_assets")
              .select("*", { count: "exact", head: true })
              .eq("variant_id", variant.id);
            existing = count || 0;
          }
          const needed = Math.max(0, target - existing);
          if (needed === 0) continue;

          // Generate copy upfront
          let copies: any[] = [];
          try { copies = await generateCopy(brief, variant, brand, inspirationText, apiKey); } catch (e) { console.error("copy err", e); }
          // Top up if AI returned fewer than requested
          if (copies.length < needed) {
            try {
              const more = await generateCopy(brief, { ...variant, copy_count: needed - copies.length, name: variant.name + " (alt)" }, brand, inspirationText, apiKey);
              copies = [...copies, ...more];
            } catch (e) { console.error("copy topup err", e); }
          }

          // Pick product reference image (if any) for this brief
          const productImages: string[] = (brief.scraped_context?.product_images || []) as string[];
          const productImageUrl: string | null = productImages.length > 0 ? productImages[0] : null;
          if (productImageUrl) console.log(`Using product reference image: ${productImageUrl}`);

          for (let i = 0; i < needed; i++) {
            const copy = copies[i] || copies[i % Math.max(copies.length, 1)] || {};
            let raw_image_path: string | null = null;
            if (i < variant.image_count) {
              try {
                const img = await generateImage(brief, variant, brand, visualHint, inspirationVisualHint, productImageUrl, apiKey);
                if (img) {
                  const ext = img.mime.includes("jpeg") ? "jpg" : "png";
                  const path = `${brief.client_slug}/${brief.id}/${variant.id}/${crypto.randomUUID()}.${ext}`;
                  const up = await supa.storage.from("creative-assets").upload(path, img.bytes, {
                    contentType: img.mime, upsert: false,
                  });
                  if (up.error) console.error("upload err", up.error);
                  else raw_image_path = path;
                }
              } catch (e) { console.error("image err", e); }
            }
            await supa.from("creative_assets").insert({
              variant_id: variant.id,
              raw_image_path,
              copy_headline: copy.headline || null,
              copy_body: copy.body || null,
              copy_cta: copy.cta || null,
              status: "draft",
            });
          }
        }
      } catch (e) {
        console.error("batch worker error:", e);
      }
    })());

    return new Response(JSON.stringify({ ok: true, started: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-creative-batch error:", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});