
CREATE TABLE public.eshop_budget_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_slug text NOT NULL,
  channel text NOT NULL DEFAULT '_total',
  target_amount numeric NOT NULL DEFAULT 0,
  month integer NOT NULL,
  year integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_slug, channel, month, year)
);

ALTER TABLE public.eshop_budget_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to eshop_budget_targets"
  ON public.eshop_budget_targets
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
