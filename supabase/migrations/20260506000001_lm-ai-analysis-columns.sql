ALTER TABLE public.lm_session_competitors
  ADD COLUMN IF NOT EXISTS ai_analysis jsonb;

ALTER TABLE public.lm_sessions
  ADD COLUMN IF NOT EXISTS ai_cross_analysis jsonb;
