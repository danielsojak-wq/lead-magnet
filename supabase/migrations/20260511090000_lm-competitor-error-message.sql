alter table lm_session_competitors
  add column if not exists error_message text;
