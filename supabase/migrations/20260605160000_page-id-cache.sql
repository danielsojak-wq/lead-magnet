BEGIN;

-- ============================================================
-- Fix: scrape přes flaky vanity URL (facebook.com/<slug>) občas spadne na
-- "Maximum redirect limit exceeded" → 0 reklam (eshop vidí sebe prázdného).
-- Řešení: cachovat page_id per doména z úspěšných scrapů a příště scrapovat
-- přes canonical Ads Library URL (view_all_page_id — bez redirectu).
-- Vše additivní: nová tabulka + nový sloupec. Nic se nemaže.
-- ============================================================

-- 1) Cache doména → FB page_id (z úspěšně zvalidovaných scrapů)
CREATE TABLE IF NOT EXISTS public.lm_page_id_cache (
  domain     text PRIMARY KEY,
  page_id    text NOT NULL,
  page_name  text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Jen service_role (edge funkce) — žádný anon přístup (konzistentní s RLS lockdownem)
ALTER TABLE public.lm_page_id_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lm_page_id_cache FROM anon, authenticated;

-- 2) Retry-on-empty strop: hráč dostane max 1 retry scrape
ALTER TABLE public.lm_session_competitors
  ADD COLUMN IF NOT EXISTS scrape_retried boolean NOT NULL DEFAULT false;

-- 3) SEED cache z dosavadních nascrapovaných reklam → domény s historií
--    (vč. vikio.cz → 208923246594) jsou opravené hned na příštím běhu,
--    ne až po dalším úspěšném scrapu. Doména normalizovaná stejně jako
--    extractDomain() v edge fn: lower, bez protokolu, bez www, bez path.
INSERT INTO public.lm_page_id_cache (domain, page_id, page_name)
SELECT domain, page_id, page_name FROM (
  SELECT
    split_part(regexp_replace(regexp_replace(lower(c.url), '^https?://', ''), '^www\.', ''), '/', 1) AS domain,
    a.page_id,
    max(a.page_name) AS page_name,
    row_number() OVER (
      PARTITION BY split_part(regexp_replace(regexp_replace(lower(c.url), '^https?://', ''), '^www\.', ''), '/', 1)
      ORDER BY count(*) DESC
    ) AS rn
  FROM public.lm_session_ads a
  JOIN public.lm_session_competitors c ON c.id = a.competitor_id
  WHERE a.page_id IS NOT NULL AND a.page_id <> ''
  GROUP BY 1, a.page_id
) ranked
WHERE rn = 1
ON CONFLICT (domain) DO NOTHING;

COMMIT;
