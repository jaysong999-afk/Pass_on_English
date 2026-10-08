BEGIN;

-- Keep the currently deployed app compatible while the migration 053 app
-- release is prepared. The legacy month argument is deliberately ignored;
-- migration 053 derives the policy month from the database clock.
CREATE OR REPLACE FUNCTION public.create_lesson_reschedule_request(
  p_lesson_id uuid,
  p_proposed_scheduled_at timestamptz,
  p_reason text,
  p_initiator public.reschedule_initiator,
  p_request_month text
)
RETURNS public.lesson_reschedule_requests
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT public.create_lesson_reschedule_request(
    p_lesson_id,
    p_proposed_scheduled_at,
    p_reason,
    p_initiator
  );
$$;

ALTER FUNCTION public.create_lesson_reschedule_request(
  uuid, timestamptz, text, public.reschedule_initiator, text
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.create_lesson_reschedule_request(
  uuid, timestamptz, text, public.reschedule_initiator, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_lesson_reschedule_request(
  uuid, timestamptz, text, public.reschedule_initiator, text
) TO authenticated, service_role;

COMMIT;
