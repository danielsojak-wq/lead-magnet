// Sync leada BEZ REKLAM do Ecomailu.
//
// Když session skončí `no_ads_scraped` (nikdo — zadavatel ani konkurenti — na Metě
// neinzeruje), analýza se nespustí (není z čeho, jinak by AI halucinovala). Lead ale
// dal ověřený e-mail → patří do nurturingu, jen NE do standardní sekvence.
//
// Standardní nurturing (pipeline 39721) se spouští TAGEM `lead-magnet-analyza`.
// Proto tady vědomě přidáváme JINÝ tag (`lm-no-ads`) a NEspouštíme autorespondery —
// standardní sekvence tím pádem nenaskočí. Daniel na tag `lm-no-ads` staví zkrácenou
// automatizaci ("ve tvém segmentu na Metě nikdo neinzeruje").
//
// Idempotence: update_existing:true + resubscribe:false → opakované volání nevytvoří
// duplicitu ani nereaktivuje odhlášeného.

// deno-lint-ignore no-explicit-any
type Supa = any;

/** Tag, na který se váže ZKRÁCENÁ no-ads sekvence. NESMÍ být lead-magnet-analyza. */
export const NO_ADS_TAG = "lm-no-ads";

const ECOMAIL_LIST_ID = 1;

function domainName(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Zapíše no-ads leada do Ecomailu s tagem `lm-no-ads`. Fire-and-forget: chyba se
 * loguje, ale NIKDY nepropadne nahoru (nesmí shodit pipeline/poll, které to volají).
 * Vrací true při úspěšném zápisu, jinak false.
 */
export async function syncNoAdsLeadToEcomail(supa: Supa, sessionId: string): Promise<boolean> {
  const apiKey = Deno.env.get("ECOMAIL_API_KEY");
  if (!apiKey) {
    console.log(JSON.stringify({ level: "warn", message: "ecomail_noads_skip", reason: "ECOMAIL_API_KEY not set", session_id: sessionId }));
    return false;
  }

  try {
    const { data: s } = await supa
      .from("lm_sessions").select("email, eshop_url").eq("id", sessionId).maybeSingle();
    if (!s?.email) {
      console.log(JSON.stringify({ level: "warn", message: "ecomail_noads_skip", reason: "no email", session_id: sessionId }));
      return false;
    }

    const { data: comps } = await supa
      .from("lm_session_competitors").select("position, url")
      .eq("session_id", sessionId).gt("position", 0).order("position");
    const comp1 = (comps ?? []).find((c: { position: number }) => c.position === 1);
    const comp2 = (comps ?? []).find((c: { position: number }) => c.position === 2);

    const payload = {
      subscriber_data: {
        email: s.email,
        custom_fields: {
          lm_analysis_analyzed_domain: domainName(s.eshop_url ?? ""),
          lm_analysis_competitor_1: comp1 ? domainName(comp1.url) : "",
          lm_analysis_competitor_2: comp2 ? domainName(comp2.url) : "",
        },
        // JINÝ tag než standardní sekvence — ta se spouští tagem lead-magnet-analyza.
        tags: [NO_ADS_TAG],
      },
      // NEspouštět standardní autorespondery. Zkrácená sekvence běží na tag-trigger.
      trigger_autoresponders: false,
      update_existing: true,
      resubscribe: false,
    };

    const res = await fetch(`https://api2.ecomailapp.cz/lists/${ECOMAIL_LIST_ID}/subscribe`, {
      method: "POST",
      headers: { key: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.log(JSON.stringify({ level: "error", message: "ecomail_noads_failed", session_id: sessionId, status: res.status, detail: detail.slice(0, 200) }));
      return false;
    }
    const masked = String(s.email).slice(0, 2) + "***" + String(s.email).slice(String(s.email).indexOf("@"));
    console.log(JSON.stringify({ level: "info", message: "ecomail_noads_ok", session_id: sessionId, email_masked: masked }));
    return true;
  } catch (e) {
    console.log(JSON.stringify({ level: "error", message: "ecomail_noads_error", session_id: sessionId, error: String(e) }));
    return false;
  }
}
