-- Add admin_direct to notification_type enum for CS 1:1 messages

DO $enum$
BEGIN
  ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'admin_direct';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$enum$;
