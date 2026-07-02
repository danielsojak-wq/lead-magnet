-- Stuck-scraping recovery: časová značka kdy hráč vstoupil do fáze `scraping`.
-- poll-lm-pipeline z ní odvodí, jestli Apify run visí příliš dlouho (RUNNING bez
-- výsledku) a má se force-terminovat, aby session neuvízla v `scraping` navždy.
-- Analogie k lm_sessions.analyzing_started_at (stuck-`analyzing` recovery).
alter table public.lm_session_competitors
  add column if not exists scraping_started_at timestamptz;

comment on column public.lm_session_competitors.scraping_started_at is
  'Kdy hráč vstoupil do stavu scraping. Použito pro stuck-scraping timeout v poll-lm-pipeline.';
