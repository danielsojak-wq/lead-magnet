-- Tabulka konkurentů (max 3 sloty na klienta)
CREATE TABLE public.competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_slug text NOT NULL,
  slot integer NOT NULL CHECK (slot BETWEEN 1 AND 3),
  name text NOT NULL,
  meta_library_url text,
  website_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_slug, slot)
);
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny public competitors" ON public.competitors FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "Service role competitors" ON public.competitors FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER competitors_updated_at BEFORE UPDATE ON public.competitors
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Reset existujících scrapovaných dat (kompletní vyčištění před přechodem na nový model)
DELETE FROM public.competitor_insights;
DELETE FROM public.creative_brief_inspirations;
DELETE FROM public.competitor_ads;
DELETE FROM public.competitor_scrape_runs;

-- Přidání reference na konkurenta
ALTER TABLE public.competitor_ads ADD COLUMN competitor_id uuid REFERENCES public.competitors(id) ON DELETE CASCADE;
ALTER TABLE public.competitor_scrape_runs ADD COLUMN competitor_id uuid REFERENCES public.competitors(id) ON DELETE CASCADE;
CREATE INDEX idx_competitor_ads_competitor ON public.competitor_ads(competitor_id);
CREATE INDEX idx_competitor_runs_competitor ON public.competitor_scrape_runs(competitor_id);

-- Insights: nově nesou competitor_id (NULL = cross competitor souhrn)
ALTER TABLE public.competitor_insights ADD COLUMN competitor_id uuid REFERENCES public.competitors(id) ON DELETE CASCADE;
ALTER TABLE public.competitor_insights ADD COLUMN website_context text;

-- Unique pro per-competitor (brand/sales) a pro cross (NULL)
CREATE UNIQUE INDEX competitor_insights_per_competitor_unique
  ON public.competitor_insights(client_slug, competitor_id, insight_type)
  WHERE competitor_id IS NOT NULL;
CREATE UNIQUE INDEX competitor_insights_cross_unique
  ON public.competitor_insights(client_slug, insight_type)
  WHERE competitor_id IS NULL;