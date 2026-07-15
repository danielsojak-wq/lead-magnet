import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ECOMAIL_LIST_ID, MANUAL_OUTREACH_SOURCE, MANUAL_OUTREACH_TAG, TRIAGE_STATUS } from "../_shared/lm-triage-config.ts";

// Přesun leada na manuální outreach. Volatelné JEN pro icp_fit = true.
//
// (a) Ecomail — přidat informativní tag lm-manual-outreach.
//     ⚠️ Ecomail `update-subscriber` TAGY PŘEPISUJE ("Content overwrites current tags",
//     žádný append endpoint neexistuje). Naivní PUT s jedním tagem by SMAZAL
//     lead-magnet-analyza → vyhodil by leada z aktivní nurturing sekvence.
//     Proto: GET stávající tagy → zapiš SJEDNOCENÍ (stávající + nový).
//     Nespouštíme autorespondery, neměníme status ani listy → sekvence běží dál.
// (b) POST na MAKE_MANUAL_OUTREACH_WEBHOOK_URL (env; když prázdné → skip, ne error).
// (c) status='moved_to_manual', moved_to_manual_at=now().

const ECOMAIL_BASE = "https://api2.ecomailapp.cz";

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

/** Přidá tag BEZ ztráty stávajících (read → union → write). */
async function addEcomailTag(apiKey: string, email: string, tag: string): Promise<{ ok: boolean; tags?: string[]; detail?: string }> {
  const h = { key: apiKey, "Content-Type": "application/json" };

  const getRes = await fetch(`${ECOMAIL_BASE}/lists/${ECOMAIL_LIST_ID}/subscriber/${encodeURIComponent(email)}`, { headers: h });
  if (!getRes.ok) {
    const detail = await getRes.text();
    return { ok: false, detail: `GET subscriber ${getRes.status}: ${detail.slice(0, 200)}` };
  }
  const sub = await getRes.json();
  const current: string[] = Array.isArray(sub?.subscriber?.tags) ? sub.subscriber.tags : [];

  // Už otagovaný → nic neposílej (idempotentní, žádný zbytečný zápis).
  if (current.includes(tag)) return { ok: true, tags: current };

  const merged = [...new Set([...current, tag])];
  const putRes = await fetch(`${ECOMAIL_BASE}/lists/${ECOMAIL_LIST_ID}/update-subscriber`, {
    method: "PUT",
    headers: h,
    // POUZE tags — žádné trigger_autoresponders, žádná změna listu/statusu.
    body: JSON.stringify({ email, subscriber_data: { tags: merged } }),
  });
  if (!putRes.ok) {
    const detail = await putRes.text();
    return { ok: false, detail: `PUT update-subscriber ${putRes.status}: ${detail.slice(0, 200)}` };
  }
  return { ok: true, tags: merged };
}

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

    const supa = admin();

    const { data: lead, error: lErr } = await supa
      .from("lm_lead_triage")
      .select("id, email, domain, session_id, draft_message, status")
      .eq("id", triageId).maybeSingle();
    if (lErr) throw lErr;
    if (!lead) return json({ error: "lead not found" }, 404);

    // Bez ICP guardu — rozhodnutí dělá člověk klikem (Přesunout / Odmítnout).
    // Odmítnuté leady jdou přes action=skip a sem se nedostanou.
    if (lead.status === TRIAGE_STATUS.MOVED_TO_MANUAL) {
      return json({ ok: true, already_moved: true });
    }

    // Kontext pro Make payload
    const { data: comps } = await supa
      .from("lm_session_competitors").select("position, url")
      .eq("session_id", lead.session_id).gt("position", 0).order("position");
    const competitorDomains = (comps ?? []).map((c: any) => domainOf(c.url)).filter(Boolean) as string[];

    const siteUrl = Deno.env.get("SITE_URL") ?? "https://analyza.performind.cz";
    const analysisUrl = lead.session_id ? `${siteUrl}/results/${lead.session_id}` : null;

    const result: Record<string, unknown> = { ok: true, id: triageId };

    // (a) Ecomail tag — sjednocení, sekvenci nerozbije
    const ecomailKey = Deno.env.get("ECOMAIL_API_KEY");
    if (ecomailKey) {
      const tagRes = await addEcomailTag(ecomailKey, lead.email, MANUAL_OUTREACH_TAG);
      result.ecomail_tagged = tagRes.ok;
      result.ecomail_tags = tagRes.tags ?? null;
      if (!tagRes.ok) {
        console.error("ecomail tag failed:", tagRes.detail);
        result.ecomail_detail = tagRes.detail;
      }
    } else {
      result.ecomail_tagged = false;
      result.ecomail_detail = "ECOMAIL_API_KEY not set";
    }

    // (b) Make webhook — env zatím placeholder → skip, ne error
    const makeUrl = Deno.env.get("MAKE_MANUAL_OUTREACH_WEBHOOK_URL");
    if (makeUrl) {
      const payload = {
        email: lead.email,
        domain: lead.domain,
        competitor_1: competitorDomains[0] ?? null,
        competitor_2: competitorDomains[1] ?? null,
        analysis_url: analysisUrl,
        draft_message: lead.draft_message,
        // Název klíče musí sedět na HubSpot property `acquisition_channel` — Make mapuje
        // podle názvu. Dřív se posílalo jen `source`, což se v HubSpotu nikam nenamapovalo
        // a board filtr (acquisition_channel = "Lead Magnet Manual Outreach") vracel 0 kontaktů.
        acquisition_channel: MANUAL_OUTREACH_SOURCE,
        source: MANUAL_OUTREACH_SOURCE,   // ponecháno kvůli zpětné kompatibilitě scénáře
      };
      try {
        const r = await fetch(makeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        });
        result.make_posted = r.ok;
        if (!r.ok) result.make_detail = `HTTP ${r.status}`;
      } catch (e) {
        result.make_posted = false;
        result.make_detail = String(e);
        console.error("make webhook failed:", e);
      }
    } else {
      result.make_posted = false;
      result.make_detail = "MAKE_MANUAL_OUTREACH_WEBHOOK_URL not set (skipped)";
    }

    // (c) Status — zapisujeme i když Ecomail/Make selže (akci udělal člověk, nechceme ji ztratit;
    //     případný fail je vidět v response i v logu).
    const { error: uErr } = await supa
      .from("lm_lead_triage")
      .update({
        status: TRIAGE_STATUS.MOVED_TO_MANUAL,
        moved_to_manual_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", triageId);
    if (uErr) throw uErr;

    console.log(JSON.stringify({ level: "info", message: "lead_moved_to_manual", ...result }));
    return json(result);
  } catch (e) {
    console.error("lm-move-to-manual error:", e);
    return json({ error: String(e) }, 500);
  }
});
