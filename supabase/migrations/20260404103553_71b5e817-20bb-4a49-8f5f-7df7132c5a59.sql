
-- Cache table for eshop cost data
CREATE TABLE public.cached_eshop_costs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_slug text NOT NULL,
  date date NOT NULL,
  channel text NOT NULL DEFAULT '',
  campaign_name text NOT NULL DEFAULT '',
  web text NOT NULL DEFAULT '',
  cost numeric NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cached_eshop_costs_slug ON public.cached_eshop_costs(client_slug);
CREATE INDEX idx_cached_eshop_costs_slug_date ON public.cached_eshop_costs(client_slug, date);

ALTER TABLE public.cached_eshop_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all public access to cached_eshop_costs"
ON public.cached_eshop_costs
FOR ALL
TO public
USING (false)
WITH CHECK (false);

CREATE POLICY "Service role full access to cached_eshop_costs"
ON public.cached_eshop_costs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Sync log table
CREATE TABLE public.data_sync_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_slug text NOT NULL,
  source_type text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  rows_count integer NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX idx_data_sync_log_slug_type ON public.data_sync_log(client_slug, source_type);

ALTER TABLE public.data_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all public access to data_sync_log"
ON public.data_sync_log
FOR ALL
TO public
USING (false)
WITH CHECK (false);

CREATE POLICY "Service role full access to data_sync_log"
ON public.data_sync_log
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Enable pg_cron and pg_net extensions for scheduled syncing
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
