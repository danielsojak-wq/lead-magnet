BEGIN;

-- ============================================================
-- L1 self-heal: když se session dokončí (ready), ale hráči selhala L1
-- (nascrapováno ads>0, ale status=failed kvůli transientní chybě Gemini),
-- poll-lm-pipeline dá JEDEN re-run v čerstvé invokaci (nový 150s budget +
-- nové Gemini okno). Idempotentní (úspěšní hráči reuse). Tenhle flag je
-- strop, ať nevzniká nekonečná smyčka re-runů.
-- Additivní, nic se nemaže.
-- ============================================================

ALTER TABLE public.lm_sessions
  ADD COLUMN IF NOT EXISTS l1_retried boolean NOT NULL DEFAULT false;

COMMIT;
