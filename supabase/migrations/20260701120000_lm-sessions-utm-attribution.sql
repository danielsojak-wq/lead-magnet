-- Meta ad attribution — z jaké reklamy/kampaně lead přišel.
-- Frontend captureUtm() plní z URL parametrů (utm_term={{ad.name}},
-- utm_content={{adset.name}}, utm_campaign={{campaign.name}}); odsud tečou
-- do Ecomailu jako lm_analysis_source_ad/adset/campaign custom fields.
-- Nullable + additive: staré sessions zůstanou null (retroaktivně nedoplníme).
ALTER TABLE lm_sessions ADD COLUMN IF NOT EXISTS utm_source text;
ALTER TABLE lm_sessions ADD COLUMN IF NOT EXISTS utm_medium text;
ALTER TABLE lm_sessions ADD COLUMN IF NOT EXISTS utm_campaign text;
ALTER TABLE lm_sessions ADD COLUMN IF NOT EXISTS utm_content text;
ALTER TABLE lm_sessions ADD COLUMN IF NOT EXISTS utm_term text;
