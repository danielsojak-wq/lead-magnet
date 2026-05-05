
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.verify_admin_password(_username text, _password text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins
    WHERE username = _username
      AND password_hash = extensions.crypt(_password, password_hash)
  )
$$;

INSERT INTO public.admins (username, password_hash)
VALUES ('admin', extensions.crypt('Prf8mK2xQ9wL', extensions.gen_salt('bf')));
