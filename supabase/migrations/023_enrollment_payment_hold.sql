-- Enrollment payment hold: student confirm → slot hold → payment deadline

ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

CREATE INDEX IF NOT EXISTS idx_enrollments_payment_deadline
  ON enrollments (status, payment_status, payment_deadline_at)
  WHERE status = 'pending_payment';
