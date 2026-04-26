-- Retention: hard-delete channel='ui' notifications older than 90 days.
-- Wrapped in DO block so dev databases without pg_cron skip silently.
DO $$
BEGIN
  PERFORM cron.schedule(
    'notify-ui-retention',
    '0 3 * * *',
    $cron$
      DELETE FROM notifications
      WHERE channel = 'ui'
        AND created_at < NOW() - INTERVAL '90 days';
    $cron$
  );
  RAISE NOTICE 'pg_cron job notify-ui-retention scheduled.';
EXCEPTION
  WHEN undefined_schema THEN
    RAISE NOTICE 'pg_cron not available — skipping retention job (dev environment).';
  WHEN others THEN
    RAISE NOTICE 'Could not schedule notify-ui-retention: %', SQLERRM;
END;
$$;
