CREATE TABLE public.competitor_website_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id uuid NOT NULL UNIQUE,
  client_slug text NOT NULL,
  url text NOT NULL,
  markdown text,
  summary text,
  scraped_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.competitor_website_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny public competitor_website_cache"
ON public.competitor_website_cache
FOR ALL
TO public
USING (false)
WITH CHECK (false);

CREATE POLICY "Service role competitor_website_cache"
ON public.competitor_website_cache
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX idx_competitor_website_cache_client ON public.competitor_website_cache(client_slug);