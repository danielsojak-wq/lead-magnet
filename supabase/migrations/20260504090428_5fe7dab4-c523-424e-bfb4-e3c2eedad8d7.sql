-- Fix unique constraint on competitor_insights
-- Old: UNIQUE(client_slug, insight_type) — neumožňovalo per-competitor řádky se stejným insight_type
-- New: UNIQUE(client_slug, COALESCE(competitor_id, '00000000-0000-0000-0000-000000000000'::uuid), insight_type)

ALTER TABLE public.competitor_insights
  DROP CONSTRAINT IF EXISTS competitor_insights_client_slug_insight_type_key;

-- Použijeme partial unique indexy: jeden pro řádky s competitor_id, druhý pro NULL competitor_id
CREATE UNIQUE INDEX IF NOT EXISTS competitor_insights_per_competitor_uniq
  ON public.competitor_insights (client_slug, competitor_id, insight_type)
  WHERE competitor_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS competitor_insights_cross_uniq
  ON public.competitor_insights (client_slug, insight_type)
  WHERE competitor_id IS NULL;