
-- Enable pgcrypto for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create clients table
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS: deny all public access
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
-- No RLS policies = no access via anon/authenticated roles

-- Seed OBB client with slug and hashed password
INSERT INTO public.clients (slug, name, password_hash)
VALUES ('543465', 'OBB Stavební materiály', crypt('obbperformind2026', gen_salt('bf')));
