create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

select cron.schedule(
  'email-delivery-monitor-every-15-minutes',
  '*/15 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/email-delivery-monitor',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-email-monitor-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'email_monitor_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 5000
    );
  $$
);
