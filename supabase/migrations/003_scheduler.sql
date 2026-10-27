-- Per-reader scheduling: pg_cron calls the app every 10 minutes; the app claims
-- readers whose edition is due. The bearer secret lives in Supabase Vault.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- select vault.create_secret('<CRON_SECRET>', 'digest_cron_secret', 'Bearer token for /api/cron/tick');
select cron.schedule(
  'morning-digest-tick',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://morning-digest-khaki.vercel.app/api/cron/tick',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'digest_cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
