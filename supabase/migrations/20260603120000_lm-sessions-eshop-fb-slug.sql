-- Eshop (position 0) FB vanity slug — enables Apify Page URL mode for the
-- analysed e-shop, same as competitors already use. Nullable + additive:
-- old sessions stay null and fall back to the q= keyword Ads Library URL.
ALTER TABLE lm_sessions ADD COLUMN IF NOT EXISTS eshop_fb_slug text;
