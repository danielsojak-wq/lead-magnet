/**
 * Single source of truth for the writeback contract between
 * the edge function (write-lead-review) and generated Apps Script.
 *
 * Both the Apps Script generator and edge function must use these
 * exact field names and status values so they stay in sync.
 */

/** Field names sent in the JSON payload to Apps Script */
export const WRITEBACK_FIELDS = {
  submissionId: "submission_id",
  status: "status",
} as const;

/** Status values the Apps Script expects */
export const WRITEBACK_STATUS = {
  relevant: "qualified",
  irrelevant: "not_qualified",
  duplicate: "not_qualified",
  unreviewed: "clear",
} as const;

export type WritebackStatusKey = keyof typeof WRITEBACK_STATUS;
