ALTER TABLE public.creative_briefs
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS landing_url text,
  ADD COLUMN IF NOT EXISTS product_context text,
  ADD COLUMN IF NOT EXISTS scraped_context jsonb DEFAULT '{}'::jsonb;