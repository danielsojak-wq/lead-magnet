
CREATE TABLE public.notification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_type text NOT NULL CHECK (user_type IN ('admin', 'am')),
  user_id text NOT NULL,
  user_display_name text,
  client_slug text NOT NULL,
  rule_type text NOT NULL CHECK (rule_type IN ('no_lead_days', 'ads_inactive')),
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivery jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  last_notified_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to notification_rules"
  ON public.notification_rules
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
