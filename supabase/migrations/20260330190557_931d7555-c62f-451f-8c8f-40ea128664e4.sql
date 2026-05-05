
CREATE TABLE public.ecommerce_digest_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  am_id uuid NOT NULL REFERENCES public.account_managers(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  schedule_type text NOT NULL DEFAULT 'daily',
  schedule_time text NOT NULL DEFAULT '08:00',
  schedule_days integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  delivery_type text NOT NULL DEFAULT 'channel',
  delivery_channel text,
  delivery_slack_email text,
  last_sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (am_id)
);

ALTER TABLE public.ecommerce_digest_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to ecommerce_digest_schedules"
  ON public.ecommerce_digest_schedules FOR ALL
  USING (true)
  WITH CHECK (true);
