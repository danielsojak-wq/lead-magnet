
-- Brand DNA per klient
CREATE TABLE public.creative_brand_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_slug text NOT NULL UNIQUE,
  primary_color text,
  secondary_color text,
  accent_color text,
  font_family text,
  tone_of_voice text,
  scraped_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_creative_brand_profiles_client ON public.creative_brand_profiles(client_slug);

-- Hlavička briefu
CREATE TABLE public.creative_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_slug text NOT NULL,
  name text NOT NULL,
  usp text,
  claim text,
  goal text,
  audience text,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_creative_briefs_client ON public.creative_briefs(client_slug, created_at DESC);

-- Řádky variant briefu
CREATE TABLE public.creative_brief_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id uuid NOT NULL REFERENCES public.creative_briefs(id) ON DELETE CASCADE,
  name text NOT NULL,
  format text NOT NULL,           -- '1:1' | '9:16' | '16:9' | '4:5'
  angle text,                     -- 'emocionalni' | 'racionalni' | 'urgence' | 'socialni-dukaz' | ...
  copy_count integer NOT NULL DEFAULT 3,
  image_count integer NOT NULL DEFAULT 2,
  section text,                   -- pro v2: PPC/Meta/TikTok/...
  note text,
  position integer NOT NULL DEFAULT 0,
  template_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_creative_brief_variants_brief ON public.creative_brief_variants(brief_id, position);

-- Vygenerované výstupy
CREATE TABLE public.creative_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES public.creative_brief_variants(id) ON DELETE CASCADE,
  raw_image_path text,
  composed_image_path text,
  copy_headline text,
  copy_body text,
  copy_cta text,
  status text NOT NULL DEFAULT 'draft', -- draft | approved | rejected
  feedback text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_creative_assets_variant ON public.creative_assets(variant_id);

-- Šablony
CREATE TABLE public.creative_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  format text NOT NULL,            -- '1:1' | '9:16' | '16:9' | '4:5'
  width integer NOT NULL,
  height integer NOT NULL,
  layout_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_creative_templates_format ON public.creative_templates(format) WHERE is_active = true;

-- Updated_at trigger function (reuse common pattern)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_creative_brand_profiles_updated
  BEFORE UPDATE ON public.creative_brand_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_creative_briefs_updated
  BEFORE UPDATE ON public.creative_briefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS, deny public; service role plné přístupy
ALTER TABLE public.creative_brand_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_brief_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny public creative_brand_profiles" ON public.creative_brand_profiles FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "Service role creative_brand_profiles" ON public.creative_brand_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Deny public creative_briefs" ON public.creative_briefs FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "Service role creative_briefs" ON public.creative_briefs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Deny public creative_brief_variants" ON public.creative_brief_variants FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "Service role creative_brief_variants" ON public.creative_brief_variants FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Deny public creative_assets" ON public.creative_assets FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "Service role creative_assets" ON public.creative_assets FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Deny public creative_templates" ON public.creative_templates FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "Service role creative_templates" ON public.creative_templates FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Storage bucket pro vygenerované assety (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('creative-assets', 'creative-assets', false)
ON CONFLICT (id) DO NOTHING;

-- Service role only access; klient přistupuje přes podepsané URL
CREATE POLICY "Service role creative-assets bucket"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'creative-assets')
  WITH CHECK (bucket_id = 'creative-assets');
