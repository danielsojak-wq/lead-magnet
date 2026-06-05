BEGIN;

-- ============================================================
-- Pipeline recovery — strop pokusů + atomický claim zaseklé session.
-- Cíl: žádná session neuvízne navždy v "analyzing"; re-trigger se NESMÍ
-- spustit 2× souběžně (dvojitý L2 = dvojitá Gemini cena / rozbitý výsledek).
-- Vše additivní: nový sloupec (IF NOT EXISTS) + nová funkce. Nic se nemaže.
-- ============================================================

-- 1) Počítadlo recovery pokusů (jen recovery re-triggery, ne první běh)
ALTER TABLE public.lm_sessions
  ADD COLUMN IF NOT EXISTS analyze_attempts integer NOT NULL DEFAULT 0;

-- 2) Atomický CLAIM zaseklé session — race ošetřen na DB úrovni.
--    Když dva polly trefí práh současně: Postgres serializuje UPDATE přes
--    row-lock; vítěz commitne (analyzing_started_at := now()), poražený
--    re-vyhodnotí WHERE (now() už NENÍ < cutoff) → 0 řádků → nic nedělá.
--    Status zůstává 'analyzing' po celou dobu → žádné transientní 'processing'
--    okno, tedy žádný fall-through double-trigger jinou cestou v poll-lm-pipeline.
--    Vrací nové analyze_attempts JEN vítězi; poraženým 0 řádků.
CREATE OR REPLACE FUNCTION public.claim_stuck_lm_session(
  p_session_id uuid,
  p_stuck_seconds integer
)
RETURNS TABLE(attempts integer)
LANGUAGE sql
AS $$
  UPDATE public.lm_sessions
  SET analyze_attempts    = analyze_attempts + 1,
      analyzing_started_at = now()
  WHERE id = p_session_id
    AND status = 'analyzing'
    AND ai_cross_analysis IS NULL
    AND analyzing_started_at IS NOT NULL
    AND analyzing_started_at < now() - make_interval(secs => p_stuck_seconds)
  RETURNING analyze_attempts;
$$;

-- Jen service_role (edge funkce) smí claim volat — ne anon/authenticated.
REVOKE ALL ON FUNCTION public.claim_stuck_lm_session(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_stuck_lm_session(uuid, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stuck_lm_session(uuid, integer) TO service_role;

COMMIT;
