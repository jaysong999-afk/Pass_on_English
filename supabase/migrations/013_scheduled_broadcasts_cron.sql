-- Index for scheduled broadcast cron processor

CREATE INDEX IF NOT EXISTS idx_admin_broadcasts_scheduled_due
  ON admin_broadcasts (scheduled_at ASC)
  WHERE status = 'scheduled';
