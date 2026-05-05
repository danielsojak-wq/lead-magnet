ALTER TABLE public.creative_brand_profiles
  ADD COLUMN IF NOT EXISTS client_brief TEXT,
  ADD COLUMN IF NOT EXISTS client_brief_file_name TEXT,
  ADD COLUMN IF NOT EXISTS client_brief_char_count INTEGER,
  ADD COLUMN IF NOT EXISTS client_brief_updated_at TIMESTAMPTZ;