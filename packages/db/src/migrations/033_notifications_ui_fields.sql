-- 032_notifications_ui_fields.sql
-- Add UI-feed fields to existing notifications table. Additive only.

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type         TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS severity     TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS deep_link    TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS batch_id     UUID;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_notifications_severity'
  ) THEN
    ALTER TABLE notifications
      ADD CONSTRAINT chk_notifications_severity
      CHECK (severity IS NULL OR severity IN ('info','success','warning','error'))
      NOT VALID;
  END IF;
END $$;

ALTER TABLE notifications VALIDATE CONSTRAINT chk_notifications_severity;

CREATE INDEX IF NOT EXISTS idx_notifications_feed
  ON notifications (tenant_id, user_id, created_at DESC)
  WHERE dismissed_at IS NULL AND channel = 'ui';

CREATE INDEX IF NOT EXISTS idx_notifications_unread_ui
  ON notifications (tenant_id, user_id)
  WHERE read_at IS NULL AND dismissed_at IS NULL AND channel = 'ui';

CREATE INDEX IF NOT EXISTS idx_notifications_batch
  ON notifications (tenant_id, batch_id)
  WHERE batch_id IS NOT NULL AND channel = 'ui';
