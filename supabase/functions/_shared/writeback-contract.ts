/**
 * Mirror of src/lib/writeback-contract.ts for edge functions.
 * Keep these two files in sync – they define the contract between
 * write-lead-review and the generated Apps Script.
 */

export const WRITEBACK_FIELDS = {
  submissionId: "submission_id",
  status: "status",
} as const;

export const WRITEBACK_STATUS: Record<string, string> = {
  relevant: "qualified",
  irrelevant: "not_qualified",
  duplicate: "not_qualified",
  unreviewed: "clear",
} as const;
