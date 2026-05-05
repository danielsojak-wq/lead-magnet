
-- Cached marketing costs table
CREATE TABLE public.cached_marketing_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_slug text NOT NULL,
  date date NOT NULL,
  source text NOT NULL DEFAULT '',
  medium text NOT NULL DEFAULT '',
  cost numeric NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  campaign_name text NOT NULL DEFAULT '',
  campaign_id text NOT NULL DEFAULT '',
  conversions numeric NOT NULL DEFAULT 0,
  conversions_value numeric NOT NULL DEFAULT 0,
  web text NOT NULL DEFAULT '',
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cached_marketing_costs_slug_date ON public.cached_marketing_costs (client_slug, date);

-- Cached ad costs table
CREATE TABLE public.cached_ad_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_slug text NOT NULL,
  date date NOT NULL,
  source text NOT NULL DEFAULT '',
  medium text NOT NULL DEFAULT '',
  cost numeric NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  campaign_name text NOT NULL DEFAULT '',
  campaign_id text NOT NULL DEFAULT '',
  conversions numeric NOT NULL DEFAULT 0,
  conversions_value numeric NOT NULL DEFAULT 0,
  web text NOT NULL DEFAULT '',
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cached_ad_costs_slug_date ON public.cached_ad_costs (client_slug, date);

-- Cron job for leadgen data sync (every hour at minute 35, offset from eshop sync at minute 5)
SELECT cron.schedule(
  'sync-leadgen-data-hourly',
  '35 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/sync-leadgen-data',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );$$
);
