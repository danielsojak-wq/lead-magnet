-- Account managers table
CREATE TABLE public.account_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.account_managers ENABLE ROW LEVEL SECURITY;

-- Junction table for AM <-> client assignments
CREATE TABLE public.account_manager_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_manager_id uuid NOT NULL REFERENCES public.account_managers(id) ON DELETE CASCADE,
  client_slug text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(account_manager_id, client_slug)
);

ALTER TABLE public.account_manager_clients ENABLE ROW LEVEL SECURITY;

-- Verify AM password function
CREATE OR REPLACE FUNCTION public.verify_am_password(_username text, _password text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.account_managers
    WHERE username = _username
      AND password_hash = extensions.crypt(_password, password_hash)
  )
$$;

-- Insert Alex
INSERT INTO public.account_managers (username, password_hash, display_name)
VALUES ('alex', extensions.crypt('055Oq;"@c7J@', extensions.gen_salt('bf')), 'Alex');