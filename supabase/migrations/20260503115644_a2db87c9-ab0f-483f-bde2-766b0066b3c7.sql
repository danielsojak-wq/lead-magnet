
CREATE TABLE public.competitor_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_slug text NOT NULL,
  ad_archive_id text,
  page_name text,
  image_url text,
  video_url text,
  primary_text text,
  ad_start_date date,
  ad_end_date date,
  is_active boolean DEFAULT true,
  link_url text,
  cta_text text,
  raw jsonb DEFAULT '{}'::jsonb,
  scrape_run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_competitor_ads_client ON public.competitor_ads(client_slug);
CREATE INDEX idx_competitor_ads_start ON public.competitor_ads(ad_start_date);
CREATE UNIQUE INDEX uniq_competitor_ads_client_archive ON public.competitor_ads(client_slug, ad_archive_id) WHERE ad_archive_id IS NOT NULL;

ALTER TABLE public.competitor_ads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny public competitor_ads" ON public.competitor_ads FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "Service role competitor_ads" ON public.competitor_ads FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.competitor_scrape_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_slug text NOT NULL,
  library_url text NOT NULL,
  apify_run_id text,
  status text NOT NULL DEFAULT 'queued',
  ads_count integer NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_by_email text
);
CREATE INDEX idx_competitor_runs_client ON public.competitor_scrape_runs(client_slug);

ALTER TABLE public.competitor_scrape_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny public competitor_scrape_runs" ON public.competitor_scrape_runs FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "Service role competitor_scrape_runs" ON public.competitor_scrape_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
