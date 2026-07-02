-- Watchdog cron: každou minutu ťukne lm-pipeline-watchdog, který dožene každou
-- nedokončenou session (belt-and-suspenders k self-poll driveru ve start-lm-analysis
-- pro případ, kdy driver umře na 150s limitu A uživatel má zavřený tab).
--
-- GATED: vyžaduje pg_cron + pg_net (dashboard → Database → Extensions). Guard níže
-- migraci NEshodí, když extensions chybí — jen skip (viz memory pgcron-not-enabled).
-- Po zapnutí extensions stačí migraci znovu aplikovat ručně přes MCP.

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_cron/pg_net není povolen — přeskakuji watchdog cron (nejdřív zapni extensions)';
    return;
  end if;

  -- Idempotent: přeplánuj (odstraň starý job, když existuje).
  perform cron.unschedule('lm-pipeline-watchdog')
    where exists (select 1 from cron.job where jobname = 'lm-pipeline-watchdog');

  perform cron.schedule(
    'lm-pipeline-watchdog',
    '* * * * *',
    $cron$
    select net.http_post(
      url := 'https://pxhpmgzeduqazgfzllyo.supabase.co/functions/v1/lm-pipeline-watchdog',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        -- anon publishable key (LM projekt) — funkce je --no-verify-jwt, apikey stačí pro gateway
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4aHBtZ3plZHVxYXpnZnpsbHlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMjg0MzMsImV4cCI6MjA5MzcwNDQzM30.8bZWhBAkdP0uil_-IDEpHkEGbMT31shlkZmauNb_6Bo'
      ),
      body := '{}'::jsonb
    );
    $cron$
  );
end $$;
