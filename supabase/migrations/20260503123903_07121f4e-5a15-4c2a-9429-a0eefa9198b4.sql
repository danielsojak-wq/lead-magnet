
ALTER TABLE public.competitor_ads
  ADD COLUMN IF NOT EXISTS is_inspiration boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_competitor_ads_inspiration
  ON public.competitor_ads(client_slug) WHERE is_inspiration = true;

CREATE TABLE IF NOT EXISTS public.creative_brief_inspirations (
  brief_id uuid NOT NULL REFERENCES public.creative_briefs(id) ON DELETE CASCADE,
  competitor_ad_id uuid NOT NULL REFERENCES public.competitor_ads(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brief_id, competitor_ad_id)
);

ALTER TABLE public.creative_brief_inspirations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny public creative_brief_inspirations"
  ON public.creative_brief_inspirations
  FOR ALL TO public
  USING (false) WITH CHECK (false);

CREATE POLICY "Service role creative_brief_inspirations"
  ON public.creative_brief_inspirations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
