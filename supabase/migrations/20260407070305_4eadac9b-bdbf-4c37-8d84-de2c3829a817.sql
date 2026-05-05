
SELECT cron.unschedule('sync-leadgen-data-hourly');

SELECT cron.schedule(
  'sync-leadgen-data-hourly',
  '35 * * * *',
  $$
  SELECT net.http_post(
    url:='https://wqmdibuviwlizjnjxygv.supabase.co/functions/v1/sync-leadgen-data',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxbWRpYnV2aXdsaXpqbmp4eWd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwODg0NTAsImV4cCI6MjA4NzY2NDQ1MH0.O4BlM24TQKtRDCuP3tOEV7XDAUMQ2Bm8lOo58zQ19EE"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
