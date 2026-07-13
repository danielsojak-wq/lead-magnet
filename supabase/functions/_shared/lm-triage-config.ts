// ─── Lead triage — SINGLE SOURCE OF TRUTH ────────────────────────────────────
// Importuje ho scan edge funkce I frontend (/dev/lead-triage). Žádná z těchto
// hodnot nesmí být hardcoded na druhém místě — texty v UI se generují odsud.
// Čisté TS bez Deno/DOM API, aby šlo importovat z obou stran (Deno i Vite).

/** Kolik dní od vstupu do nurturing sekvence musí uplynout, než lead spadne do triage. */
export const DAY_CHECKPOINT = 7;

/** Tag, kterým Ecomail značí leady z lead magnetu (nastavuje syncToEcomail). */
export const NURTURING_TAG = "lead-magnet-analyza";

/** Informativní tag přidaný při přesunu na manuální outreach. NESMÍ nahradit ostatní tagy. */
export const MANUAL_OUTREACH_TAG = "lm-manual-outreach";

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
