ALTER TABLE public.lm_session_competitors
  ADD CONSTRAINT lm_session_competitors_session_position_unique
  UNIQUE (session_id, position);

ALTER TABLE public.lm_session_ads
  ADD CONSTRAINT lm_session_ads_session_archive_unique
  UNIQUE (session_id, ad_archive_id);