CREATE TABLE public.source_campaign_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_slug text NOT NULL,
  source_name text NOT NULL,
  campaign_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_slug, source_name, campaign_name)
);

ALTER TABLE public.source_campaign_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to source_campaign_mappings"
ON public.source_campaign_mappings
FOR ALL
USING (true)
WITH CHECK (true);