-- A database restore can copy auth.refresh_tokens rows without advancing the
-- backing identity sequence. The next login/signup then collides with an
-- existing primary key and GoTrue returns HTTP 500 while creating the session.
--
-- Keep all existing sessions. Realign only the sequence, under a brief lock so
-- a concurrent token insert cannot race MAX(id) and setval(). This migration is
-- idempotent and safe to run again.

DO $repair_refresh_token_sequence$
DECLARE
  sequence_name text;
  greatest_id bigint;
BEGIN
  IF to_regclass('auth.refresh_tokens') IS NULL THEN
    RAISE EXCEPTION 'auth.refresh_tokens does not exist';
  END IF;

  sequence_name := pg_get_serial_sequence('auth.refresh_tokens', 'id');
  IF sequence_name IS NULL THEN
    RAISE EXCEPTION 'No identity sequence found for auth.refresh_tokens.id';
  END IF;

  LOCK TABLE auth.refresh_tokens IN SHARE ROW EXCLUSIVE MODE;

  SELECT max(id)
  INTO greatest_id
  FROM auth.refresh_tokens;

  IF greatest_id IS NULL THEN
    PERFORM pg_catalog.setval(sequence_name::regclass, 1, false);
  ELSE
    PERFORM pg_catalog.setval(sequence_name::regclass, greatest_id, true);
  END IF;
END
$repair_refresh_token_sequence$;
