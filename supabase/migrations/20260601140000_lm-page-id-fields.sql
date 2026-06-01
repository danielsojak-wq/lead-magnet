-- lm_session_ads: add page_id + page_name from Apify actor output
ALTER TABLE lm_session_ads ADD COLUMN IF NOT EXISTS page_id   text;
ALTER TABLE lm_session_ads ADD COLUMN IF NOT EXISTS page_name text;

-- lm_session_competitors: add fb_slug (sameAs slug from website HTML)
-- Separate from `name` which is used for display in UI (ResultsPage, CompetitorAdsPage)
ALTER TABLE lm_session_competitors ADD COLUMN IF NOT EXISTS fb_slug text;
