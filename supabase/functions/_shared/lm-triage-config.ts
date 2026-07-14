// ─── Lead triage — SINGLE SOURCE OF TRUTH ────────────────────────────────────
// Importuje ho scan edge funkce I frontend (/dev/lead-triage). Žádná z těchto
// hodnot nesmí být hardcoded na druhém místě — texty v UI se generují odsud.
// Čisté TS bez Deno/DOM API, aby šlo importovat z obou stran (Deno i Vite).

/** Kolik dní od vstupu do nurturing sekvence musí uplynout, než lead spadne do triage. */
export const DAY_CHECKPOINT = 7;

/**
 * FLOOR DATE — odkdy vůbec MÁME data o otevřeních.
 *
 * Ecomail webhooky NEPOSÍLAJÍ historii, jen události od okamžiku registrace. Leady,
 * které vstoupily do sekvence dřív, tedy mají 0 open eventů ne proto, že by email
 * neotevřeli, ale proto, že jsme tehdy ještě neposlouchali. Scan by je označil jako
 * channel mismatch → falešná pozitiva.
 *
 * Proto scan bere JEN leady s `completed_at >= EVENT_DATA_SINCE`. Backfill vědomě
 * NEDĚLÁME: z Ecomail API by šel získat leda agregát kampaně, který nejde spolehlivě
 * napárovat na konkrétní kontakt — a nespolehlivý per-lead údaj je horší než poctivé
 * "o téhle době nevíme".
 *
 * Nastaveno na den nasazení webhooku (2026-07-13). Dashboard tuhle hodnotu zobrazuje
 * ("data od …"), ať je i za měsíc jasné, proč se počty neshodují s celkovým počtem
 * leadů v sekvenci.
 */
export const EVENT_DATA_SINCE = "2026-07-13T00:00:00.000Z";

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
