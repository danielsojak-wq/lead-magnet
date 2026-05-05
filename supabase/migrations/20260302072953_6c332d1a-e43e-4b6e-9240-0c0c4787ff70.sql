
CREATE TABLE public.lead_timeline (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_slug TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('note', 'status_change')),
  content TEXT,
  status TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_timeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to lead_timeline" ON public.lead_timeline
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_lead_timeline_lookup ON public.lead_timeline (client_slug, submission_id, created_at DESC);
