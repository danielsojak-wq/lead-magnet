
CREATE OR REPLACE FUNCTION public.set_client_password(_client_id uuid, _password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  UPDATE public.clients
  SET password_hash = extensions.crypt(_password, extensions.gen_salt('bf'))
  WHERE id = _client_id;
END;
$$;
