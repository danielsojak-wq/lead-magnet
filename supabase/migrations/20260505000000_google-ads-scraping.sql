-- Add google_library_url to competitors
ALTER TABLE public.competitors ADD COLUMN google_library_url text;

-- Add ad_source to competitor_ads (values: 'meta', 'google')
ALTER TABLE public.competitor_ads ADD COLUMN ad_source text NOT NULL DEFAULT 'meta';

-- Add ad_source to competitor_scrape_runs
ALTER TABLE public.competitor_scrape_runs ADD COLUMN ad_source text NOT NULL DEFAULT 'meta';
