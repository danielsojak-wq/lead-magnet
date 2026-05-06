ALTER TABLE public.lm_session_competitors
  ADD COLUMN IF NOT EXISTS apify_google_run_id text;
