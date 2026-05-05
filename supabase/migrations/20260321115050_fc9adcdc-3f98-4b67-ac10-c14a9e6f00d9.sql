CREATE POLICY "Allow public read access to account_manager_clients"
ON public.account_manager_clients
FOR SELECT
USING (true);