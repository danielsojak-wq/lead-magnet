-- Meta Conversions API (CAPI) — matching data + sdílené event_id na lm_sessions.
-- Aditivní, vše nullable, nic se nemaže. email už existuje (nedotčen).
ALTER TABLE public.lm_sessions
  ADD COLUMN IF NOT EXISTS fbp                  text,
  ADD COLUMN IF NOT EXISTS fbc                  text,
  ADD COLUMN IF NOT EXISTS client_ip            text,
  ADD COLUMN IF NOT EXISTS client_user_agent    text,
  ADD COLUMN IF NOT EXISTS lead_event_id        text,
  ADD COLUMN IF NOT EXISTS completereg_event_id text;
