-- Lead magnet analysis sessions
CREATE TABLE public.lm_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,

  -- Email verification
  verification_token uuid UNIQUE DEFAULT gen_random_uuid(),
  token_expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  email_verified_at timestamptz,

  -- User's eshop
  eshop_url text,
  eshop_meta_library_url text,
  eshop_google_library_url text,
  eshop_name text,
  eshop_summary text,
  eshop_ad_mix jsonb NOT NULL DEFAULT '{"brand":0,"sales":0,"retargeting":0}'::jsonb,

  -- Status lifecycle: email_pending → urls_pending → processing → ready | failed
  status text NOT NULL DEFAULT 'email_pending',
  error_message text,

  -- Cross-competitor synthesis (L3 result)
  cross_summary text,

  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Competitors within a session (up to 2)
CREATE TABLE public.lm_session_competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.lm_sessions(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position IN (1, 2)),

  url text NOT NULL,
  name text,
  meta_library_url text,
  google_library_url text,

  -- Status: pending → processing → ready | failed
  status text NOT NULL DEFAULT 'pending',
  summary text,
  ads_count integer NOT NULL DEFAULT 0,
  ad_mix jsonb NOT NULL DEFAULT '{"brand":0,"sales":0,"retargeting":0}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (session_id, position)
);

-- Scraped ads for competitors
CREATE TABLE public.lm_session_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.lm_sessions(id) ON DELETE CASCADE,
  competitor_id uuid NOT NULL REFERENCES public.lm_session_competitors(id) ON DELETE CASCADE,

  ad_source text NOT NULL DEFAULT 'meta', -- meta | google
  ad_archive_id text,
  image_url text,
  video_url text,
  primary_text text,
  ad_type text, -- brand | sales | retargeting
  is_active boolean NOT NULL DEFAULT true,
  ad_start_date date,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.lm_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lm_session_competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lm_session_ads ENABLE ROW LEVEL SECURITY;

-- Public read (session UUID is the access token; no PII-leaking joins from anon)
CREATE POLICY "Public select lm_sessions"
  ON public.lm_sessions FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Service role lm_sessions"
  ON public.lm_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Public select lm_session_competitors"
  ON public.lm_session_competitors FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Service role lm_session_competitors"
  ON public.lm_session_competitors FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Public select lm_session_ads"
  ON public.lm_session_ads FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Service role lm_session_ads"
  ON public.lm_session_ads FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX idx_lm_sessions_email   ON public.lm_sessions(email);
CREATE INDEX idx_lm_sessions_token   ON public.lm_sessions(verification_token);
CREATE INDEX idx_lm_competitors_sess ON public.lm_session_competitors(session_id);
CREATE INDEX idx_lm_ads_competitor   ON public.lm_session_ads(competitor_id);
CREATE INDEX idx_lm_ads_session      ON public.lm_session_ads(session_id);
