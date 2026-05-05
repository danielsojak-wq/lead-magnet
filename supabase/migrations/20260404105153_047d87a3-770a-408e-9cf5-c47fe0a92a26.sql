
-- Table for team members who can login via Google OAuth
CREATE TABLE public.team_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('admin', 'account_manager', 'marketing')),
  display_name text,
  linked_am_id uuid REFERENCES public.account_managers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: deny public, allow service_role
ALTER TABLE public.team_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all public access to team_users"
  ON public.team_users FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Service role full access to team_users"
  ON public.team_users FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Index for fast email lookup
CREATE INDEX idx_team_users_email ON public.team_users (email);
