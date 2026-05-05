CREATE TABLE public.client_lead_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_slug text NOT NULL,
  campaign_name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (client_slug, campaign_name)
);

ALTER TABLE public.client_lead_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to client_lead_campaigns"
  ON public.client_lead_campaigns
  FOR ALL
  USING (true)
  WITH CHECK (true);