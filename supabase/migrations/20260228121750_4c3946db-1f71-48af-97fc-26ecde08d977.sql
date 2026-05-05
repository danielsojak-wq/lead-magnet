CREATE TABLE public.lead_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_slug text NOT NULL,
  submission_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('relevant', 'irrelevant')),
  reviewed_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (client_slug, submission_id)
);

ALTER TABLE public.lead_reviews ENABLE ROW LEVEL SECURITY;

-- Allow anon to insert/select (auth is session-based, not Supabase Auth)
CREATE POLICY "Allow all access to lead_reviews" ON public.lead_reviews
  FOR ALL USING (true) WITH CHECK (true);