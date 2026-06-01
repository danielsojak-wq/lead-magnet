BEGIN;

-- ============================================================
-- lm_ tables: revoke excess grants, restrict anon column access
--
-- Problem: anon had table-level INSERT/UPDATE/DELETE/etc. grants
-- (never exploitable due to RLS, but flagged by security scanner).
-- Additionally, anon SELECT on lm_sessions exposed email and
-- verification_token — only id + status are needed by frontend
-- (CheckEmailPage polls lm_sessions.status via supabase-js anon).
-- lm_session_competitors and lm_session_ads are read exclusively
-- by get-lm-results edge function (service_role) — anon/authenticated
-- have no legitimate direct-read use case.
-- ============================================================

-- 1. REVOKE excess write grants on all 3 tables from anon + authenticated.
--    These were never usable (no RLS policy allowed writes for these roles)
--    but existed as table-level grants from the initial schema setup.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON lm_sessions, lm_session_competitors, lm_session_ads
  FROM anon, authenticated;

-- 2. lm_sessions — replace broad anon SELECT with column-level SELECT.
--    Sensitive columns (email, verification_token, token_expires_at,
--    email_verified_at) become invisible to anon.
--    Kept: id (needed for WHERE id = $1 filter) and status (the only
--    column CheckEmailPage actually reads).
REVOKE SELECT ON lm_sessions FROM anon;
GRANT SELECT (id, status) ON lm_sessions TO anon;
-- authenticated keeps its existing table-level SELECT (no change).

-- 3. lm_session_competitors + lm_session_ads — REVOKE SELECT entirely
--    from anon and authenticated. All reads go through get-lm-results
--    (service_role); no direct frontend .from() calls confirmed.
REVOKE SELECT ON lm_session_competitors, lm_session_ads FROM anon, authenticated;

-- service_role grants are untouched.

COMMIT;
