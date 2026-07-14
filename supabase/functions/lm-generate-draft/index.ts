import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Vygeneruje AI draft LinkedIn zprávy pro lead z lm_lead_triage.
// Kontext: doména zadavatele, 2 konkurenti, quick wins z hotové analýzy.
// AI PRAVIDLA (závazná napříč projektem, porušení = bug):
//   1) nikdy % rozpočtu ani absolutní spend (ta data nemáme)
//   2) nikdy Google Ads (analyzujeme výhradně Metu)
//   3) nikdy "zadavatel" / "Konkurent A/B" — VŽDY reálné názvy domén
//   4) reálné domény musí být v promptu i ve výstupu konzistentně

const AI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const AI_MODEL = "gemini-2.5-flash";

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function domainOf(url: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

const SYSTEM = `Jsi Daniel Soják, zakladatel české výkonnostní agentury Performind. Píšeš KRÁTKOU LinkedIn zprávu majiteli/marketérovi českého e-shopu, kterému jsme zdarma zpracovali analýzu jeho Meta reklam vs. konkurence. E-mail mu evidentně nefunguje jako kanál (analýzu si neotevřel), takže ho oslovuješ na LinkedIn.

ZÁVAZNÁ PRAVIDLA (porušení = nepoužitelný výstup):
- NIKDY nezmiňuj % rozpočtu, útratu, budget ani alokaci peněz. Tato data nemáme.
- NIKDY nezmiňuj Google Ads ani jiný kanál než Meta (Facebook/Instagram). Analyzujeme výhradně Metu.
- NIKDY nepiš "zadavatel", "Konkurent A", "Konkurent B" ani jiné zástupné názvy. Používej VÝHRADNĚ reálné názvy domén, které dostaneš v zadání.
- Nevymýšlej si čísla ani fakta, která nemáš v zadání.

STYL:
- Česky, tykání ne — vykej.
- Max 90 slov. Žádné odrážky, plynulý text, 2–3 krátké odstavce.
- Bez oslovení typu "Dobrý den, jmenuji se..." — jdi rovnou k věci, lidsky.
- Konkrétní: opři se o JEDEN nejsilnější quick win a zmiň jednoho reálného konkurenta jménem domény.
- Zakonči nízkoprahovou otázkou (ne tvrdý prodej, ne "rezervujte si call").
- Žádné emoji, žádný marketingový žargon.

Vrať POUZE text zprávy, nic jiného.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    // FAIL-CLOSED: když env chybí, odmítni. (Naivní `body.password !== env` by při
    // nenastavené proměnné propustilo request bez hesla → undefined !== undefined = false.)
    const devPassword = Deno.env.get("PERFORMIND_DEV_PASSWORD");
    if (!devPassword || typeof body.password !== "string" || body.password !== devPassword) {
      return json({ error: "Unauthorized" }, 401);
    }
    const triageId = body.id as string | undefined;
    if (!triageId) return json({ error: "id required" }, 400);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ error: "GEMINI_API_KEY not configured" }, 500);

    const supa = admin();

    const { data: lead, error: lErr } = await supa
      .from("lm_lead_triage").select("id, email, domain, session_id").eq("id", triageId).maybeSingle();
    if (lErr) throw lErr;
    if (!lead) return json({ error: "lead not found" }, 404);
    if (!lead.session_id) return json({ error: "lead has no session" }, 400);

    const { data: session, error: sErr } = await supa
      .from("lm_sessions").select("eshop_url, ai_cross_analysis").eq("id", lead.session_id).maybeSingle();
    if (sErr) throw sErr;

    const { data: comps, error: cErr } = await supa
      .from("lm_session_competitors").select("position, url").eq("session_id", lead.session_id).order("position");
    if (cErr) throw cErr;

    // Reálné domény — pravidlo #3/#4. Nikdy zástupné názvy.
    const eshopDomain = lead.domain ?? domainOf(session?.eshop_url ?? null) ?? "váš e-shop";
    const competitors = (comps ?? [])
      .filter((c: any) => c.position > 0)
      .map((c: any) => domainOf(c.url))
      .filter(Boolean) as string[];

    const quickWins = ((session?.ai_cross_analysis as any)?.quick_wins ?? []) as Array<{ akce?: string; proc?: string }>;
    const wins = quickWins.slice(0, 3)
      .map((w, i) => `${i + 1}. ${w.akce ?? ""}${w.proc ? ` — ${w.proc}` : ""}`)
      .filter(s => s.trim().length > 3)
      .join("\n");

    const user = `E-SHOP (reálná doména, používej ji jménem): ${eshopDomain}
KONKURENTI (reálné domény, používej je jménem): ${competitors.join(", ") || "—"}

QUICK WINS z naší analýzy jeho Meta reklam:
${wins || "(žádné quick wins v analýze)"}

Napiš LinkedIn zprávu pro ${eshopDomain}.`;

    const res = await fetch(AI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_MODEL,
        // POZOR: gemini-2.5-* je thinking model a přes OpenAI-compat se reasoning tokeny
        // počítají do max_tokens. S max_tokens:600 spotřeboval thinking skoro celý budget
        // a na text zbylo ~25 tokenů → draft se ukládal useknutý uprostřed slova
        // (finish_reason:"length", ale tiše). Proto: thinking vypnout + velký strop.
        reasoning_effort: "none",
        max_tokens: 2000,
        temperature: 0.7,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error("Gemini error:", res.status, detail.slice(0, 300));
      return json({ error: `AI HTTP ${res.status}` }, 502);
    }
    const d = await res.json();
    const choice = d?.choices?.[0];
    const draft = String(choice?.message?.content ?? "").trim();
    if (!draft) return json({ error: "AI vrátila prázdný draft" }, 502);
    // Useknutý draft NIKDY neukládej — radši hlasitá chyba než půlka věty odeslaná leadovi.
    if (choice?.finish_reason === "length") {
      console.error("Gemini truncated draft:", JSON.stringify({ usage: d?.usage, chars: draft.length }));
      return json({ error: "AI odpověď byla useknutá (finish_reason=length) — draft neuložen" }, 502);
    }

    const { error: uErr } = await supa
      .from("lm_lead_triage")
      .update({ draft_message: draft, updated_at: new Date().toISOString() })
      .eq("id", triageId);
    if (uErr) throw uErr;

    return json({ ok: true, draft_message: draft });
  } catch (e) {
    console.error("lm-generate-draft error:", e);
    return json({ error: String(e) }, 500);
  }
});
