-- Run after supabase/reminders.sql and after creating both Vault entries using
-- the separate SQL Editor commands in docs/daily-reminders.md. This tracked
-- file intentionally contains no production URL or CRON_SECRET value.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'candor_production_url') then
    raise exception 'Missing Vault secret: candor_production_url';
  end if;
  if not exists (select 1 from vault.secrets where name = 'candor_cron_secret') then
    raise exception 'Missing Vault secret: candor_cron_secret';
  end if;
end
$$;

select cron.schedule(
  'candor-daily-reminder-1500-utc',
  '0 15 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'candor_production_url') || '/api/cron/reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'candor_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

select cron.schedule(
  'candor-daily-reminder-1600-utc',
  '0 16 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'candor_production_url') || '/api/cron/reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'candor_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- Inspect jobs: select jobid, jobname, schedule, active from cron.job where jobname like 'candor-daily-reminder-%';
-- Remove if needed: select cron.unschedule('candor-daily-reminder-1500-utc');
--                   select cron.unschedule('candor-daily-reminder-1600-utc');
