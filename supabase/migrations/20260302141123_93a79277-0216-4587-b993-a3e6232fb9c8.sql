
-- Drop the restrictive policy and create a permissive one
DROP POLICY IF EXISTS "Allow all access to client_activity_log" ON public.client_activity_log;

CREATE POLICY "Allow all access to client_activity_log"
  ON public.client_activity_log
  FOR ALL
  USING (true)
  WITH CHECK (true);
