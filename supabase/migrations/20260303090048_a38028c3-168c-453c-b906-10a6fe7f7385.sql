
-- Create marketing_users table
CREATE TABLE public.marketing_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.marketing_users ENABLE ROW LEVEL SECURITY;

-- Create verify function
CREATE OR REPLACE FUNCTION public.verify_marketing_password(_username text, _password text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.marketing_users
    WHERE username = _username
      AND password_hash = extensions.crypt(_password, password_hash)
  )
$$;

-- Insert the shared marketing user
INSERT INTO public.marketing_users (username, password_hash, display_name)
VALUES (
  'performind',
  extensions.crypt('5~r{[4n(Rb7>', extensions.gen_salt('bf')),
  'Performind Marketing'
);
