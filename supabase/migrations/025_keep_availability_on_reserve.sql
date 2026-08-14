-- Enrollment holds must not delete teacher working hours.
-- Occupied slots are represented by enrollments and lessons, not by removing
-- rows from teachers_weekly_availability.

CREATE OR REPLACE FUNCTION public.reserve_teacher_availability_slots(
  p_teacher_id uuid,
  p_slots jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'student'
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN;
END;
$$;

ALTER FUNCTION public.reserve_teacher_availability_slots(uuid, jsonb) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.reserve_teacher_availability_slots(uuid, jsonb) TO authenticated;

-- Restore working hours that previous enrollment holds deleted.
INSERT INTO public.teachers_weekly_availability (teacher_id, day, start_time)
SELECT DISTINCT
  e.teacher_id,
  d.day,
  e.preferred_slot_time::time
FROM public.enrollments e
JOIN public.pricing_plans p ON p.id = e.plan_id
CROSS JOIN LATERAL jsonb_array_elements_text(
  COALESCE(p.description -> 'schedule_days', '[]'::jsonb)
) AS d(day)
WHERE e.status IN ('pending_payment', 'active', 'expiring_soon')
  AND e.payment_status IS DISTINCT FROM 'rejected'
  AND e.preferred_slot_time IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.teachers_weekly_availability (teacher_id, day, start_time)
SELECT DISTINCT
  l.teacher_id,
  CASE EXTRACT(ISODOW FROM (timezone('Asia/Seoul', l.scheduled_at)))
    WHEN 1 THEN 'Mon'
    WHEN 2 THEN 'Tue'
    WHEN 3 THEN 'Wed'
    WHEN 4 THEN 'Thu'
    WHEN 5 THEN 'Fri'
    WHEN 6 THEN 'Sat'
    ELSE 'Sun'
  END,
  (timezone('Asia/Seoul', l.scheduled_at))::time
FROM public.lessons l
WHERE l.status IN ('scheduled', 'reschedule_pending', 'pending_payment')
ON CONFLICT DO NOTHING;
