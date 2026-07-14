// ─── Lead triage — SINGLE SOURCE OF TRUTH ────────────────────────────────────
// Importuje ho scan edge funkce I frontend (/dev/lead-triage). Žádná z těchto
// hodnot nesmí být hardcoded na druhém místě — texty v UI se generují odsud.
// Čisté TS bez Deno/DOM API, aby šlo importovat z obou stran (Deno i Vite).

/** Kolik dní od vstupu do nurturing sekvence musí uplynout, než lead spadne do triage. */
export const DAY_CHECKPOINT = 7;

/**
 * ID Ecomail automatizace, kterou lead magnet posílá nurturing sekvenci.
 * Zdroj pravdy o otevřeních: GET /pipelines/{id}/stats-detail vrací mapu
 * { "<email>": { open, send, click, unsub, ... } } — KUMULATIVNĚ za celou dobu.
 *
 * Proto scan NEPOTŘEBUJE floor date. Dřív tu byl EVENT_DATA_SINCE (2026-07-13) postavený
 * na předpokladu, že historii otevření nejde zpětně získat (webhook posílá jen události
 * od registrace). Ten předpoklad byl CHYBNÝ — stats-detail ji vrací celou. Floor byl
 * zrušen; scan hodnotí všechny leady bez ohledu na stáří.
 *
 * lm_email_events (webhook) běží dál jako real-time audit trail, ale scan na něm nevisí.
 */
export const ECOMAIL_PIPELINE_ID = 39721;   // "Lead Magnet Analýza | Nurturing flow"

/** Tag, kterým Ecomail značí leady z lead magnetu (nastavuje syncToEcomail). */
export const NURTURING_TAG = "lead-magnet-analyza";

/** Informativní tag přidaný při přesunu na manuální outreach. NESMÍ nahradit ostatní tagy. */
export const MANUAL_OUTREACH_TAG = "lm-manual-outreach";

/**
 * Hodnota HubSpot property `acquisition_channel` (posílá se v Make payloadu pod TÍMTO názvem klíče).
 *
 * ⚠️ `acquisition_channel` je v HubSpotu ENUM (dropdown), ne volný text. Hodnota musí PŘESNĚ
 * odpovídat jedné z povolených options, jinak HubSpot odmítne celý zápis (400 INVALID_OPTION)
 * a s ním i navazující Create Task — lead do manual outreach vůbec nedorazí.
 * Pozor na pomlčku: povolená option je "Lead Magnet - Manual Outreach", ne "Lead Magnet Manual Outreach".
 * Když se option v HubSpotu přejmenuje, musí se přepsat i tady.
 */
export const MANUAL_OUTREACH_SOURCE = "Lead Magnet - Manual Outreach";

/** Ecomail list, do kterého pipeline zapisuje (viz syncToEcomail v analyze-lm-session). */
export const ECOMAIL_LIST_ID = 1;

/**
 * Ecomail posílá otevření ve dvou typech (SparkPost envelope). Nerozlišujeme je —
 * jakýkoli z nich = lead email otevřel = NENÍ channel mismatch.
 */
export const OPEN_EVENT_TYPES = ["open", "initial_open"] as const;

/** ICP kritérium — zobrazuje se ve scoring boxu. Hodnocení zůstává manuální (checkbox). */
export const ICP_CRITERIA = "CZ e-shop · 5–50 M Kč/rok · aktivní PPC";

/** Statusy řádku v lm_lead_triage. */
export const TRIAGE_STATUS = {
  NEEDS_REVIEW: "needs_review",
  MOVED_TO_MANUAL: "moved_to_manual",
  SKIPPED: "skipped",
} as const;
