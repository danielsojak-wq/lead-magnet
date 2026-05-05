
CREATE OR REPLACE FUNCTION public.verify_client_password(_client_name TEXT, _password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.clients
    WHERE name = _client_name
      AND password_hash = extensions.crypt(_password, password_hash)
  );
END;
$$;
