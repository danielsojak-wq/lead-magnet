import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SIGNED_URL_TTL = 60 * 60; // 1 hour

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function signImage(supa: any, path: string | null) {
  if (!path) return null;
  const { data } = await supa.storage.from("creative-assets").createSignedUrl(path, SIGNED_URL_TTL);
  return data?.signedUrl || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const action = body.action as string;
    const supa = admin();

    if (action === "list_briefs") {
      const slugs: string[] = body.client_slugs || [];
      if (slugs.length === 0) return ok({ briefs: [] });
      const { data, error } = await supa
        .from("creative_briefs")
        .select("id, client_slug, name, created_at")
        .in("client_slug", slugs)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return ok({ briefs: data || [] });
    }

    if (action === "get_brand_profile") {
      const { data, error } = await supa
        .from("creative_brand_profiles")
        .select("*")
        .eq("client_slug", body.client_slug)
        .maybeSingle();
      if (error) throw error;
      return ok({ profile: data });
    }

    if (action === "upsert_brand_profile") {
      const p = body.profile || {};
      const payload = {
        client_slug: body.client_slug,
        primary_color: p.primary_color || null,
        secondary_color: p.secondary_color || null,
        accent_color: p.accent_color || null,
        font_family: p.font_family || null,
        tone_of_voice: p.tone_of_voice || null,
        scraped_data: p.scraped_data || {},
      };
      const { error } = await supa
        .from("creative_brand_profiles")
        .upsert(payload, { onConflict: "client_slug" });
      if (error) throw error;
      return ok({ ok: true });
    }

    if (action === "clear_client_brief") {
      const { error } = await supa
        .from("creative_brand_profiles")
        .update({
          client_brief: null,
          client_brief_file_name: null,
          client_brief_char_count: null,
          client_brief_updated_at: null,
        })
        .eq("client_slug", body.client_slug);
      if (error) throw error;
      return ok({ ok: true });
    }

    if (action === "create_brief") {
      const b = body.brief || {};
      const productImages: string[] = Array.isArray(b.product_images) ? b.product_images.filter((x: any) => typeof x === "string").slice(0, 5) : [];
      const landingExcerpt: string = typeof b.landing_excerpt === "string" ? b.landing_excerpt.slice(0, 8000) : "";
      const scrapedCtx = (productImages.length || landingExcerpt) ? {
        product_images: productImages,
        markdown_excerpt: landingExcerpt,
        source_url: b.landing_url || b.website_url || null,
        captured_at: new Date().toISOString(),
      } : null;
      const { data: brief, error } = await supa
        .from("creative_briefs")
        .insert({
          client_slug: body.client_slug,
          name: b.name,
          usp: b.usp || null,
          claim: b.claim || null,
          goal: b.goal || null,
          audience: b.audience || null,
          website_url: b.website_url || null,
          landing_url: b.landing_url || null,
          product_context: b.product_context || null,
          created_by_email: b.created_by_email || null,
          scraped_context: scrapedCtx,
        })
        .select()
        .single();
      if (error) throw error;

      const variants = (body.variants || []) as any[];
      if (variants.length > 0) {
        const rows = variants.map((v, idx) => ({
          brief_id: brief.id,
          name: v.name || `Varianta ${idx + 1}`,
          format: v.format || "1:1",
          angle: v.angle || null,
          copy_count: Math.max(1, Number(v.copy_count) || 1),
          image_count: Math.max(0, Number(v.image_count) || 0),
          note: v.note || null,
          position: idx,
        }));
        const { error: vErr } = await supa.from("creative_brief_variants").insert(rows);
        if (vErr) throw vErr;
      }

      // Connect inspiration ads. If not specified, fall back to all ads of client marked as inspiration.
      let inspirationIds: string[] = Array.isArray(body.inspiration_ad_ids) ? body.inspiration_ad_ids : [];
      if (inspirationIds.length === 0) {
        const { data: defaults } = await supa
          .from("competitor_ads")
          .select("id")
          .eq("client_slug", body.client_slug)
          .eq("is_inspiration", true);
        inspirationIds = (defaults || []).map((r: any) => r.id);
      }
      if (inspirationIds.length > 0) {
        const insRows = inspirationIds.map((id) => ({ brief_id: brief.id, competitor_ad_id: id }));
        await supa.from("creative_brief_inspirations").insert(insRows);
      }
      return ok({ brief_id: brief.id });
    }

    if (action === "list_inspiration_ads") {
      const slug = body.client_slug;
      if (!slug) throw new Error("client_slug required");
      const { data, error } = await supa
        .from("competitor_ads")
        .select("id, page_name, image_url, video_url, primary_text, cta_text, ad_type, is_inspiration, ad_start_date")
        .eq("client_slug", slug)
        .order("is_inspiration", { ascending: false })
        .order("ad_start_date", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return ok({ ads: data || [] });
    }

    if (action === "get_brief_detail") {
      const briefId = body.brief_id;
      const [briefRes, variantsRes, assetsRes] = await Promise.all([
        supa.from("creative_briefs").select("*").eq("id", briefId).single(),
        supa.from("creative_brief_variants").select("*").eq("brief_id", briefId).order("position"),
        supa.from("creative_assets")
          .select("id, variant_id, raw_image_path, composed_image_path, copy_headline, copy_body, copy_cta, status, creative_brief_variants!inner(brief_id)")
          .eq("creative_brief_variants.brief_id", briefId),
      ]);
      if (briefRes.error) throw briefRes.error;
      if (variantsRes.error) throw variantsRes.error;
      if (assetsRes.error) throw assetsRes.error;

      const assets = await Promise.all(
        (assetsRes.data || []).map(async (a: any) => ({
          id: a.id,
          variant_id: a.variant_id,
          raw_image_url: await signImage(supa, a.composed_image_path || a.raw_image_path),
          copy_headline: a.copy_headline,
          copy_body: a.copy_body,
          copy_cta: a.copy_cta,
          status: a.status,
        }))
      );

      const { data: brand } = await supa
        .from("creative_brand_profiles")
        .select("primary_color, secondary_color, accent_color, font_family")
        .eq("client_slug", briefRes.data.client_slug)
        .maybeSingle();

        return ok({ brief: briefRes.data, variants: variantsRes.data || [], assets, brand: brand || null });
    }

    if (action === "set_asset_status") {
      const { error } = await supa
        .from("creative_assets")
        .update({ status: body.status })
        .eq("id", body.asset_id);
      if (error) throw error;
      return ok({ ok: true });
    }

    if (action === "suggest_brief_fields") {
      const slug = body.client_slug as string;
      const landingUrl = (body.landing_url as string) || "";
      if (!slug) throw new Error("client_slug required");

      const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY není nastaven");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY není nastaven");

      // Get website URL from brand profile
      const { data: brand } = await supa
        .from("creative_brand_profiles")
        .select("scraped_data, tone_of_voice")
        .eq("client_slug", slug)
        .maybeSingle();
      const websiteUrl: string = (brand?.scraped_data as any)?.source_url || "";
      if (!websiteUrl && !landingUrl) {
        throw new Error("Chybí web klienta (Brand DNA) i landing page");
      }

      async function scrape(url: string): Promise<{ markdown: string; ogImage: string | null; images: string[] }> {
        try {
          const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ url, formats: ["markdown", "links"], onlyMainContent: true }),
          });
          const d = await r.json();
          const md = ((d?.markdown || d?.data?.markdown || "") as string);
          const meta = d?.metadata || d?.data?.metadata || {};
          const ogImage = meta.ogImage || meta.og_image || null;
          const links: string[] = (d?.links || d?.data?.links || []) as string[];
          // Parse markdown image refs ![](url)
          const mdImgs: string[] = [];
          const re = /!\[[^\]]*\]\(([^)\s]+)/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(md)) !== null) mdImgs.push(m[1]);
          const allImgs = [
            ...(ogImage ? [ogImage] : []),
            ...mdImgs,
            ...links.filter((l) => /\.(png|jpe?g|webp|avif)(\?|$)/i.test(l)),
          ];
          // Filter & dedupe: drop logos, icons, sprites, favicons
          const seen = new Set<string>();
          const filtered: string[] = [];
          for (const raw of allImgs) {
            try {
              const abs = new URL(raw, url).toString();
              if (seen.has(abs)) continue;
              seen.add(abs);
              if (/logo|icon|favicon|sprite|avatar|placeholder|pixel/i.test(abs)) continue;
              if (!/^https?:\/\//.test(abs)) continue;
              filtered.push(abs);
            } catch {}
          }
          return { markdown: md.slice(0, 8000), ogImage, images: filtered.slice(0, 8) };
        } catch (e) {
          console.error("scrape error", url, e);
          return { markdown: "", ogImage: null, images: [] };
        }
      }

      const [webMd, landingMd] = await Promise.all([
        websiteUrl ? scrape(websiteUrl) : Promise.resolve({ markdown: "", ogImage: null, images: [] }),
        landingUrl ? scrape(landingUrl) : Promise.resolve({ markdown: "", ogImage: null, images: [] }),
      ]);

      // Prefer landing-page product images, then website
      const productImages = Array.from(new Set([...(landingMd.images || []), ...(webMd.images || [])])).slice(0, 6);
      console.log(`suggest_brief_fields: detected ${productImages.length} candidate product images`);

      const userPrompt = [
        brand?.tone_of_voice ? `Tone of voice značky:\n${brand.tone_of_voice}` : "",
        webMd.markdown ? `--- WEB KLIENTA (${websiteUrl}) ---\n${webMd.markdown}` : "",
        landingMd.markdown ? `--- LANDING PAGE (${landingUrl}) ---\n${landingMd.markdown}` : "",
      ].filter(Boolean).join("\n\n");

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "Jsi senior performance copywriter. Z webu klienta a landing page navrhni podklady pro reklamní brief česky. Buď konkrétní, krátký, výstižný." },
            { role: "user", content: userPrompt || "(prázdný obsah)" },
          ],
          tools: [{
            type: "function",
            function: {
              name: "fill_brief",
              description: "Vrať návrh polí briefu",
              parameters: {
                type: "object",
                properties: {
                  usp: { type: "string", description: "Hlavní výhoda v 1 větě" },
                  claim: { type: "string", description: "Krátké heslo / claim, max 6 slov" },
                  goal: { type: "string", description: "Cíl kampaně v 1 větě" },
                  audience: { type: "string", description: "Cílovka v 1 větě (demografie + zájmy)" },
                  product_context: { type: "string", description: "Vizuální vodítka pro generování obrázku, 2-3 věty" },
                },
                required: ["usp", "claim", "goal", "audience", "product_context"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "fill_brief" } },
        }),
      });
      const aiData = await aiRes.json();
      if (!aiRes.ok) {
        console.error("AI gateway error:", aiData);
        throw new Error("AI: " + (aiData?.error?.message || aiRes.status));
      }
      const call = aiData?.choices?.[0]?.message?.tool_calls?.[0];
      const args = call?.function?.arguments ? JSON.parse(call.function.arguments) : {};
      return ok({
        suggestion: args,
        product_images: productImages,
        landing_excerpt: (landingMd.markdown || webMd.markdown || "").slice(0, 8000),
        used: { website_url: websiteUrl, landing_url: landingUrl },
      });
    }

    if (action === "get_competitor_insights") {
      const slug = body.client_slug as string;
      const [{ data: competitors }, { data: insights }, { data: adCounts }, { data: webCaches }] = await Promise.all([
        supa.from("competitors").select("*").eq("client_slug", slug).order("slot"),
        supa.from("competitor_insights").select("*").eq("client_slug", slug),
        supa.from("competitor_ads").select("competitor_id").eq("client_slug", slug),
        supa.from("competitor_website_cache").select("competitor_id, scraped_at, summary, url").eq("client_slug", slug),
      ]);
      const adsByCompetitor: Record<string, number> = {};
      let totalAds = 0;
      for (const r of (adCounts || []) as any[]) {
        totalAds++;
        if (r.competitor_id) adsByCompetitor[r.competitor_id] = (adsByCompetitor[r.competitor_id] || 0) + 1;
      }
      const webByCompetitor: Record<string, { scraped_at: string; summary: string | null; url: string }> = {};
      for (const w of (webCaches || []) as any[]) {
        if (w.competitor_id) webByCompetitor[w.competitor_id] = { scraped_at: w.scraped_at, summary: w.summary, url: w.url };
      }
      return ok({
        competitors: competitors || [],
        insights: insights || [],
        ads_by_competitor: adsByCompetitor,
        total_ads: totalAds,
        web_by_competitor: webByCompetitor,
      });
    }

    if (action === "regenerate_competitor_insights") {
      const slug = body.client_slug as string;
      if (!slug) throw new Error("client_slug required");
      const { data: competitors } = await supa
        .from("competitors").select("*").eq("client_slug", slug).order("slot");
      const comps = (competitors || []) as any[];
      if (comps.length === 0) throw new Error("Žádní konkurenti — nejdříve přidej alespoň jednoho.");

      // Mark per-competitor summary as processing
      for (const c of comps) {
        await supa.from("competitor_insights").upsert({
          client_slug: slug,
          competitor_id: c.id,
          insight_type: "competitor_summary",
          status: "processing",
          error_message: null,
        }, { onConflict: "client_slug,competitor_id,insight_type" });
      }
      // Cross summary (2+ competitors)
      if (comps.length >= 2) {
        const { data: existing } = await supa.from("competitor_insights")
          .select("id").eq("client_slug", slug).is("competitor_id", null).eq("insight_type", "cross_summary").maybeSingle();
        if (existing) {
          await supa.from("competitor_insights").update({ status: "processing", error_message: null }).eq("id", existing.id);
        } else {
          await supa.from("competitor_insights").insert({
            client_slug: slug, competitor_id: null, insight_type: "cross_summary",
            status: "processing", error_message: null,
          });
        }
      }
      // @ts-ignore EdgeRuntime
      EdgeRuntime.waitUntil(generateAllCompetitorInsights(supa, slug, comps));
      return ok({ ok: true, started: true });
    }

    if (action === "list_competitors") {
      const { data, error } = await supa
        .from("competitors").select("*").eq("client_slug", body.client_slug).order("slot");
      if (error) throw error;
      return ok({ competitors: data || [] });
    }

    if (action === "upsert_competitor") {
      const c = body.competitor || {};
      if (!c.name || !c.slot) throw new Error("name a slot jsou povinné");
      const payload: any = {
        client_slug: body.client_slug,
        slot: Number(c.slot),
        name: String(c.name).trim(),
        meta_library_url: c.meta_library_url ? String(c.meta_library_url).trim() : null,
        google_library_url: c.google_library_url ? String(c.google_library_url).trim() : null,
        website_url: c.website_url ? String(c.website_url).trim() : null,
      };
      let res;
      if (c.id) {
        res = await supa.from("competitors").update(payload).eq("id", c.id).select().single();
      } else {
        res = await supa.from("competitors").upsert(payload, { onConflict: "client_slug,slot" }).select().single();
      }
      if (res.error) throw res.error;
      return ok({ competitor: res.data });
    }

    if (action === "delete_competitor") {
      const { error } = await supa.from("competitors").delete().eq("id", body.competitor_id);
      if (error) throw error;
      return ok({ ok: true });
    }

    if (action === "analyze_competitor") {
      const slug = body.client_slug as string;
      const competitorId = body.competitor_id as string;
      const maxAds = Math.min(Math.max(Number(body.max_ads) || 25, 5), 200);
      if (!slug || !competitorId) throw new Error("client_slug a competitor_id jsou povinné");

      const { data: comp, error: cErr } = await supa
        .from("competitors").select("*").eq("id", competitorId).maybeSingle();
      if (cErr || !comp) throw new Error("Konkurent nenalezen");

      // Mark insight as processing
      await supa.from("competitor_insights").upsert({
        client_slug: slug,
        competitor_id: competitorId,
        insight_type: "competitor_summary",
        status: "processing",
        error_message: null,
      }, { onConflict: "client_slug,competitor_id,insight_type" });

      // @ts-ignore EdgeRuntime
      EdgeRuntime.waitUntil(analyzeOneCompetitor(supa, slug, comp, maxAds));
      return ok({ ok: true, started: true });
    }

    return new Response(JSON.stringify({ error: "Unknown action: " + action }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("manage-creative error:", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function ok(payload: any) {
  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const TEXT_MODEL = "google/gemini-2.5-pro";
const VISION_MODEL = "google/gemini-2.5-flash";

async function aiCall(payload: any, apiKey: string) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AI gateway ${res.status}: ${txt.slice(0, 300)}`);
  }
  return res.json();
}

function pickTopAds(ads: any[], limit: number) {
  const sorted = ads.slice().sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    return (b.ad_start_date || "").localeCompare(a.ad_start_date || "");
  });
  return sorted.slice(0, limit);
}

async function describeVideo(videoUrl: string, ad: any, apiKey: string): Promise<string> {
  try {
    const data = await aiCall({
      model: TEXT_MODEL,
      messages: [
        { role: "system", content: "Jsi analytik reklamních videí. Vrať POUZE 3-4 věty v češtině: (1) o čem video je, (2) hook v prvních 3 sekundách, (3) jak je vystavěné, (4) jakou nabídku/CTA komunikuje. Žádné uvozovky, žádné odrážky." },
        { role: "user", content: [
          { type: "text", text: `Reklama značky ${ad.page_name || "?"}. Doprovodný text: ${(ad.primary_text || "").slice(0, 400)}. CTA: ${ad.cta_text || "—"}.` },
          { type: "image_url", image_url: { url: videoUrl } },
        ] as any },
      ],
    }, apiKey);
    return (data?.choices?.[0]?.message?.content || "").trim();
  } catch (e) {
    console.error("video describe err", e);
    return "";
  }
}

async function summarizeCompetitor(
  supa: any,
  slug: string,
  competitor: any,
  websiteSummary: string,
  apiKey: string,
) {
  const onConflict = "client_slug,competitor_id,insight_type";
  const baseKey = { client_slug: slug, competitor_id: competitor.id, insight_type: "competitor_summary" };

  const { data: adsData } = await supa
    .from("competitor_ads")
    .select("id, page_name, primary_text, cta_text, ad_type, image_url, video_url, ad_start_date, is_active")
    .eq("client_slug", slug)
    .eq("competitor_id", competitor.id)
    .order("ad_start_date", { ascending: false })
    .limit(80);

  const ads = adsData || [];
  if (ads.length === 0) {
    await supa.from("competitor_insights").upsert({
      ...baseKey,
      summary: null, ad_ids: [], ads_count: 0, videos_count: 0, images_count: 0,
      status: "empty",
      website_context: websiteSummary || null,
      generated_at: new Date().toISOString(),
    }, { onConflict });
    return null;
  }

  const topAds = pickTopAds(ads, 32);
  const videos = topAds.filter((a) => !!a.video_url).slice(0, 6);
  const images = topAds.filter((a) => !a.video_url && !!a.image_url);
  const videosCount = videos.length;
  const imagesCount = images.length;

  // Popis videí (paralelně po 3)
  const videoDescriptions: Record<string, string> = {};
  const concurrency = 3;
  for (let i = 0; i < videos.length; i += concurrency) {
    const batch = videos.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((a) => describeVideo(a.video_url, a, apiKey)));
    batch.forEach((a, idx) => { videoDescriptions[a.id] = results[idx]; });
  }

  // Statistiky typů
  const typeCounts: Record<string, number> = { brand: 0, sales: 0, retargeting: 0, neurceno: 0 };
  for (const a of ads) {
    const t = a.ad_type || "neurceno";
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }

  const lines = topAds.map((a, i) => {
    const kind = a.video_url ? "VIDEO" : (a.image_url ? "IMAGE" : "TEXT");
    const desc = a.video_url ? videoDescriptions[a.id] : "";
    return `${i + 1}. [${kind}] [${a.ad_type || "?"}] aktivní:${a.is_active ? "ano" : "ne"} od:${a.ad_start_date || "?"}
   Text: ${(a.primary_text || "—").slice(0, 400)}
   CTA: ${a.cta_text || "—"}${desc ? `\n   Video: ${desc}` : ""}`;
  }).join("\n");

  const sys = `Jsi senior strategický analytik konkurenčních reklam. Tvým úkolem je shrnout, JAK konkrétní konkurent využívá kreativy a textace v reklamě.

Vrať odpověď v češtině jako čistý markdown se 3 sekcemi přesně v tomto formátu (žádný úvod, žádný závěr):

### Kreativy
- bod (3–5 odrážek o vizuálním stylu, formátech, hooks ve videích, vizuální tonalitě)

### Textace
- bod (3–5 odrážek o tone of voice, délce textů, opakujících se frázích, struktuře, emoji/urgency)

### Strategie a top reklama
- Mix typů: konkrétní procenta brand/sales/retargeting podle dat
- Hlavní úhly a USP, které opakují
- Top reklama: stručně proč právě ta (nejdéle běžící / nejvýkonnější signál) a co se z ní naučit

Konkrétní postřehy, žádná vata. Pokud máš kontext z webu, propoj sdělení reklam s tím, co skutečně prodávají.`;

  const imageUrls = images.slice(0, 6).map((a) => a.image_url).filter(Boolean);
  const userContent: any[] = [
    { type: "text", text: `Konkurent: ${competitor.name}
Statistika typů (z ${ads.length} reklam): brand=${typeCounts.brand}, sales=${typeCounts.sales}, retargeting=${typeCounts.retargeting}, neurčeno=${typeCounts.neurceno}
Videí v datasetu: ${videosCount}, obrázků: ${imagesCount}
${websiteSummary ? `\n--- CO KONKURENT PRODÁVÁ (z jeho webu) ---\n${websiteSummary}\n--- KONEC ---\n` : ""}
Dataset top reklam:
${lines}

Níže přiloženy reprezentativní obrázky pro vizuální analýzu.` },
    ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } })),
  ];

  let summary = "";
  try {
    const data = await aiCall({
      model: TEXT_MODEL,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: userContent },
      ],
    }, apiKey);
    summary = (data?.choices?.[0]?.message?.content || "").trim();
  } catch (e: any) {
    await supa.from("competitor_insights").upsert({
      ...baseKey,
      status: "failed",
      error_message: String(e?.message || e).slice(0, 500),
      generated_at: new Date().toISOString(),
    }, { onConflict });
    return null;
  }

  await supa.from("competitor_insights").upsert({
    ...baseKey,
    summary,
    ad_ids: topAds.map((a) => a.id),
    ads_count: ads.length,
    videos_count: videosCount,
    images_count: imagesCount,
    status: "ready",
    error_message: null,
    website_context: websiteSummary || null,
    generated_at: new Date().toISOString(),
  }, { onConflict });

  return summary;
}

async function generateAllCompetitorInsights(supa: any, slug: string, competitors: any[]) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) { console.error("LOVABLE_API_KEY missing"); return; }

  // Načti website cache jednou pro všechny
  const { data: webRows } = await supa
    .from("competitor_website_cache")
    .select("competitor_id, summary")
    .eq("client_slug", slug);
  const webByCompetitor: Record<string, string> = {};
  for (const w of (webRows || []) as any[]) {
    if (w.competitor_id && w.summary) webByCompetitor[w.competitor_id] = w.summary;
  }

  const perCompetitor: { name: string; summary: string }[] = [];

  for (const c of competitors) {
    try {
      const websiteSummary = webByCompetitor[c.id] || "";
      const summary = await summarizeCompetitor(supa, slug, c, websiteSummary, apiKey);
      if (summary) perCompetitor.push({ name: c.name, summary });
    } catch (e) {
      console.error("competitor insight err", c.name, e);
    }
  }

  if (competitors.length >= 2) {
    await generateCrossSummary(supa, slug, perCompetitor, apiKey);
  }
}

async function generateCrossSummary(
  supa: any, slug: string,
  data: { name: string; summary: string }[], apiKey: string
) {
  const upsertCross = async (payload: any) => {
    const { data: existing } = await supa.from("competitor_insights")
      .select("id").eq("client_slug", slug).is("competitor_id", null).eq("insight_type", "cross_summary").maybeSingle();
    if (existing) await supa.from("competitor_insights").update(payload).eq("id", existing.id);
    else await supa.from("competitor_insights").insert({ client_slug: slug, competitor_id: null, insight_type: "cross_summary", ...payload });
  };
  if (data.length < 2) {
    await upsertCross({ status: "empty", summary: null, generated_at: new Date().toISOString() });
    return;
  }
  const sys = `Jsi senior strateg pro reklamy na sociálních sítích. Dostaneš shrnutí kreativ a textací více konkurentů. Tvým úkolem je najít PRŮNIKY napříč konkurencí — co dělají všichni stejně a co tedy obecně funguje.

Vrať čistý markdown v češtině přesně v tomto formátu (bez úvodu/závěru):

### Společná témata a úhly
- **Krátký název motivu** — popis (3–5 odrážek: opakující se motivy, hooky, USP, které vidíš u 2+ konkurentů)

### Společné formáty a CTA
- **Krátký název vzorce** — popis (3–5 odrážek: typy formátů, struktura textů, opakující se CTA fráze, urgence, slevy)

### Co prokazatelně funguje všem
- **Krátký název insightu** — popis (3–5 odrážek: nejsilnější vzorce, které se opakují u všech a které stojí za to převzít)

### Mezera / příležitost
- **Krátký název příležitosti** — popis (1–3 odrážky: čeho si nikdo z konkurence nevšímá a kde je prostor odlišit se)

Konkrétně, žádná vata. U každého bodu cituj konkrétního konkurenta jménem. Tučný text na začátku každé odrážky je povinný — slouží jako záhlaví.`;
  const userText = data.map((d) => `## ${d.name}\n${d.summary}`).join("\n\n");
  try {
    const res = await aiCall({
      model: TEXT_MODEL,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: `Shrnutí jednotlivých konkurentů:\n\n${userText}` },
      ],
    }, apiKey);
    const summary = (res?.choices?.[0]?.message?.content || "").trim();
    await upsertCross({ status: "ready", summary, error_message: null, generated_at: new Date().toISOString() });
  } catch (e: any) {
    await upsertCross({ status: "failed", error_message: String(e?.message || e).slice(0, 500), generated_at: new Date().toISOString() });
  }
}

// === Per-competitor full analysis: scrape web + scrape ads + summary ===
async function analyzeOneCompetitor(supa: any, slug: string, competitor: any, maxAds: number) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN");
  const onConflict = "client_slug,competitor_id,insight_type";
  const baseKey = { client_slug: slug, competitor_id: competitor.id, insight_type: "competitor_summary" };

  try {
    // 1) Scrape web (best-effort, neblokuje)
    if (competitor.website_url && FIRECRAWL_API_KEY) {
      try {
        const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
          method: "POST",
          headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url: competitor.website_url, formats: ["markdown", "summary"], onlyMainContent: true }),
        });
        const d = await r.json();
        if (r.ok) {
          const md = ((d?.markdown || d?.data?.markdown || "") as string).slice(0, 20000);
          const sum = ((d?.summary || d?.data?.summary || md.slice(0, 2000)) as string).slice(0, 4000);
          await supa.from("competitor_website_cache").upsert({
            competitor_id: competitor.id,
            client_slug: slug,
            url: competitor.website_url,
            markdown: md,
            summary: sum,
            scraped_at: new Date().toISOString(),
          }, { onConflict: "competitor_id" });
        }
      } catch (e) { console.error("analyzeOne web scrape err", e); }
    }

    // 2) Scrape Apify ads — Meta + Google in parallel
    await Promise.allSettled([
      // Meta
      (async () => {
        if (!competitor.meta_library_url || !APIFY_TOKEN) return;
        await scrapeApifySource({
          supa, slug, competitor, maxAds, apiKey: apiKey || "",
          apifyToken: APIFY_TOKEN,
          actor: "apify~facebook-ads-scraper",
          libraryUrl: competitor.meta_library_url,
          adSource: "meta",
          apifyInput: {
            startUrls: [{ url: competitor.meta_library_url }],
            resultsLimit: maxAds,
            activeStatus: "active",
          },
          mapItem: (it: any, runId: string) => mapApifyItemInline(it, slug, runId, competitor.id),
        });
      })(),
      // Google
      (async () => {
        if (!competitor.google_library_url || !APIFY_TOKEN) return;
        const googleActor = Deno.env.get("APIFY_GOOGLE_ADS_ACTOR") || "easyapi~google-ads-transparency-center-scraper";
        await scrapeApifySource({
          supa, slug, competitor, maxAds, apiKey: apiKey || "",
          apifyToken: APIFY_TOKEN,
          actor: googleActor,
          libraryUrl: competitor.google_library_url,
          adSource: "google",
          apifyInput: {
            startUrls: [{ url: competitor.google_library_url }],
            maxItems: maxAds,
          },
          mapItem: (it: any, runId: string) => mapGoogleItemInline(it, slug, runId, competitor.id),
        });
      })(),
    ]);

    // 3) Per-competitor summary
    const { data: webCache } = await supa.from("competitor_website_cache")
      .select("summary").eq("competitor_id", competitor.id).maybeSingle();
    const websiteSummary = webCache?.summary || "";
    if (apiKey) {
      await summarizeCompetitor(supa, slug, competitor, websiteSummary, apiKey);
    } else {
      await supa.from("competitor_insights").upsert({
        ...baseKey, status: "failed", error_message: "LOVABLE_API_KEY chybí", generated_at: new Date().toISOString(),
      }, { onConflict });
    }
  } catch (e: any) {
    console.error("analyzeOneCompetitor fatal", e);
    await supa.from("competitor_insights").upsert({
      ...baseKey, status: "failed", error_message: String(e?.message || e).slice(0, 500), generated_at: new Date().toISOString(),
    }, { onConflict });
  }
}

async function scrapeApifySource({
  supa, slug, competitor, maxAds, apiKey, apifyToken, actor, libraryUrl, adSource, apifyInput, mapItem,
}: {
  supa: any; slug: string; competitor: any; maxAds: number; apiKey: string;
  apifyToken: string; actor: string; libraryUrl: string; adSource: "meta" | "google";
  apifyInput: Record<string, unknown>;
  mapItem: (it: any, runId: string) => Record<string, unknown>;
}) {
  try {
    const startRes = await fetch(
      `https://api.apify.com/v2/acts/${actor}/runs?token=${apifyToken}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(apifyInput) },
    );
    const startData = await startRes.json();
    const apifyRunId = startData?.data?.id;
    if (!apifyRunId) { console.error(`${adSource} Apify start failed:`, startData); return; }

    const { data: runRow } = await supa.from("competitor_scrape_runs").insert({
      client_slug: slug, library_url: libraryUrl, apify_run_id: apifyRunId,
      status: "running", competitor_id: competitor.id, ad_source: adSource,
    }).select().single();

    // Poll up to ~5 min
    let datasetId: string | null = null;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const sRes = await fetch(`https://api.apify.com/v2/actor-runs/${apifyRunId}?token=${apifyToken}`);
      const sData = await sRes.json();
      const st = sData?.data?.status;
      if (st === "SUCCEEDED") { datasetId = sData?.data?.defaultDatasetId; break; }
      if (st && st !== "RUNNING" && st !== "READY") break;
    }

    if (datasetId && runRow) {
      const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}&clean=true&format=json`);
      const items: any[] = await itemsRes.json();
      const rows = items.map((it) => mapItem(it, runRow.id));
      if (rows.length) {
        await supa.from("competitor_ads").upsert(rows, { onConflict: "client_slug,ad_archive_id", ignoreDuplicates: false });
      }
      await supa.from("competitor_scrape_runs").update({
        status: "succeeded", finished_at: new Date().toISOString(), ads_count: rows.length,
      }).eq("id", runRow.id);

      try { await classifyAdsForRun(supa, slug, runRow.id, apiKey); } catch (e) { console.error(e); }
    }
  } catch (e) { console.error(`scrapeApifySource ${adSource} err:`, e); }
}

function mapGoogleItemInline(it: any, client_slug: string, run_id: string, competitor_id: string) {
  const toDate = (v: any) => {
    if (!v) return null;
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const n = typeof v === "number" ? v * (v < 1e12 ? 1000 : 1) : Date.parse(v);
    if (!n || isNaN(n)) return null;
    return new Date(n).toISOString().slice(0, 10);
  };
  const rawId = it?.creativeId || it?.creative_id || it?.id || it?.adId || it?.ad_id || crypto.randomUUID();
  const adArchiveId = `g_${rawId}`;
  const advertiserName = it?.advertiserName || it?.advertiser_name || it?.advertiser || it?.pageName || it?.page_name || null;
  const headline = it?.headline || it?.title || it?.adTitle || it?.ad_title || null;
  const description = it?.description || it?.body || it?.adBody || it?.ad_body || it?.text || null;
  const primaryText = [headline, description].filter(Boolean).join("\n") || null;
  const imageUrl = it?.imageUrl || it?.image_url || it?.thumbnailUrl || it?.thumbnail_url || it?.creativeImage || it?.screenshot || null;
  const videoUrl = it?.videoUrl || it?.video_url || it?.videoPreviewUrl || it?.video_preview_url || null;
  const startDate = toDate(it?.firstShownDate || it?.first_shown_date || it?.startDate || it?.start_date || it?.firstSeen || it?.first_seen);
  const endDate = toDate(it?.lastShownDate || it?.last_shown_date || it?.endDate || it?.end_date || it?.lastSeen || it?.last_seen);
  return {
    client_slug, scrape_run_id: run_id, competitor_id,
    ad_archive_id: adArchiveId,
    page_name: advertiserName,
    image_url: imageUrl,
    video_url: videoUrl,
    primary_text: primaryText,
    ad_start_date: startDate,
    ad_end_date: endDate,
    is_active: it?.isActive ?? it?.is_active ?? it?.active ?? (endDate ? false : true),
    link_url: it?.destinationUrl || it?.destination_url || it?.targetUrl || it?.target_url || it?.url || null,
    cta_text: it?.callToAction || it?.call_to_action || it?.cta || it?.ctaText || it?.cta_text || null,
    ad_source: "google",
    raw: it,
  };
}

function mapApifyItemInline(it: any, client_slug: string, run_id: string, competitor_id: string) {
  const snapshot = it?.snapshot || it;
  const startTs = it?.start_date || it?.startDate || snapshot?.creation_time;
  const endTs = it?.end_date || it?.endDate;
  const toDate = (v: any) => {
    if (!v) return null;
    const n = typeof v === "number" ? v * (v < 1e12 ? 1000 : 1) : Date.parse(v);
    if (!n || isNaN(n)) return null;
    return new Date(n).toISOString().slice(0, 10);
  };
  const images = snapshot?.images || it?.images || [];
  const cards = snapshot?.cards || it?.cards || [];
  const videos = snapshot?.videos || it?.videos || [];
  const fImg = images[0] || cards.find((c: any) => c?.originalImageUrl || c?.resizedImageUrl || c?.original_image_url || c?.resized_image_url);
  const firstImg = fImg?.originalImageUrl || fImg?.resizedImageUrl || fImg?.original_image_url || fImg?.resized_image_url || fImg?.url || it?.image_url || it?.imageUrl || null;
  const fVid = videos[0] || cards.find((c: any) => c?.videoHdUrl || c?.videoSdUrl || c?.video_hd_url || c?.video_sd_url);
  const firstVid = fVid?.videoHdUrl || fVid?.videoSdUrl || fVid?.videoPreviewImageUrl || fVid?.video_hd_url || fVid?.video_sd_url || fVid?.url || null;
  return {
    client_slug, scrape_run_id: run_id, competitor_id,
    ad_archive_id: String(it?.ad_archive_id || it?.adArchiveID || it?.id || crypto.randomUUID()),
    page_name: it?.page_name || snapshot?.page_name || null,
    image_url: firstImg, video_url: firstVid,
    primary_text: snapshot?.body?.text || snapshot?.title || it?.primary_text || it?.ad_creative_body || null,
    ad_start_date: toDate(startTs), ad_end_date: toDate(endTs),
    is_active: it?.is_active ?? (endTs ? false : true),
    link_url: snapshot?.link_url || it?.link_url || null,
    cta_text: snapshot?.cta_text || it?.cta_text || null,
    ad_source: "meta",
    raw: it,
  };
}

async function classifyAdsForRun(supa: any, client_slug: string, run_id: string, apiKey: string) {
  if (!apiKey) return;
  const { data: ads } = await supa.from("competitor_ads")
    .select("id, primary_text, cta_text, image_url, page_name").eq("client_slug", client_slug).eq("scrape_run_id", run_id).is("ad_type", null);
  if (!ads?.length) return;
  const concurrency = 4;
  for (let i = 0; i < ads.length; i += concurrency) {
    const batch = ads.slice(i, i + concurrency);
    await Promise.all(batch.map(async (ad: any) => {
      const userContent: any[] = [{ type: "text", text:
        `Klasifikuj reklamu do: brand / sales / retargeting.\nStránka: ${ad.page_name || "?"}\nCTA: ${ad.cta_text || "—"}\nText: ${ad.primary_text || "—"}` }];
      if (ad.image_url) userContent.push({ type: "image_url", image_url: { url: ad.image_url } });
      try {
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "Klasifikuj reklamu. Vždy zavolej classify_ad." },
              { role: "user", content: userContent },
            ],
            tools: [{ type: "function", function: { name: "classify_ad", parameters: {
              type: "object", properties: { ad_type: { type: "string", enum: ["brand", "sales", "retargeting"] } },
              required: ["ad_type"], additionalProperties: false } } }],
            tool_choice: { type: "function", function: { name: "classify_ad" } },
          }),
        });
        if (!res.ok) return;
        const d = await res.json();
        const args = d?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
        const t = args ? JSON.parse(args)?.ad_type : null;
        if (t) await supa.from("competitor_ads").update({ ad_type: t }).eq("id", ad.id);
      } catch (e) { console.error("classify err", e); }
    }));
  }
}