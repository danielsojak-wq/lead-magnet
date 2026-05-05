ALTER TABLE public.competitor_ads ADD COLUMN IF NOT EXISTS ad_type text;
CREATE INDEX IF NOT EXISTS competitor_ads_ad_type_idx ON public.competitor_ads(client_slug, ad_type);