CREATE TABLE public.client_activity_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_slug text NOT NULL,
  actor text NOT NULL DEFAULT 'client',
  event_type text NOT NULL,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_log_client_slug ON public.client_activity_log(client_slug);
CREATE INDEX idx_activity_log_created_at ON public.client_activity_log(created_at DESC);

ALTER TABLE public.client_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to client_activity_log" ON public.client_activity_log
  FOR ALL USING (true) WITH CHECK (true);