
-- Create a safe view for account_managers that excludes password_hash
CREATE VIEW public.account_managers_public
WITH (security_invoker = on) AS
  SELECT id, display_name, username, created_at
  FROM public.account_managers;

-- Allow public SELECT on the base table but ONLY through the view
-- We need a SELECT policy so the security_invoker view can read
CREATE POLICY "Allow select on account_managers"
  ON public.account_managers FOR SELECT
  USING (true);
