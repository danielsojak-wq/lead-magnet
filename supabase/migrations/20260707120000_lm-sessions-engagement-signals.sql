-- V2 lead triage — minimální engagement signály přímo v lm_sessions.
-- last_viewed_at:        kdy naposled někdo otevřel /results/:sessionId
-- viewed_count:          kolikrát byl hotový dashboard otevřen (jen terminální stav,
--                        ne 5s poll během processing/analyzing — viz get-lm-results)
-- booking_cta_clicked_at: první klik na "Rezervovat hovor" CTA (nejsilnější intent)
alter table public.lm_sessions
  add column if not exists last_viewed_at timestamptz,
  add column if not exists viewed_count integer not null default 0,
  add column if not exists booking_cta_clicked_at timestamptz;
