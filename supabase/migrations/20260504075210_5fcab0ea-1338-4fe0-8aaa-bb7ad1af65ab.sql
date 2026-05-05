
CREATE TABLE public.competitor_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_slug text NOT NULL,
  insight_type text NOT NULL,
  summary text,
  ad_ids uuid[] NOT NULL DEFAULT '{}',
  ads_count integer NOT NULL DEFAULT 0,
  videos_count integer NOT NULL DEFAULT 0,
  images_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'idle',
  error_message text,
  generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_slug, insight_type)
);

CREATE INDEX idx_competitor_insights_client ON public.competitor_insights(client_slug);

ALTER TABLE public.competitor_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny public competitor_insights"
  ON public.competitor_insights FOR ALL TO public
  USING (false) WITH CHECK (false);

CREATE POLICY "Service role competitor_insights"
  ON public.competitor_insights FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER competitor_insights_set_updated_at
  BEFORE UPDATE ON public.competitor_insights
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
