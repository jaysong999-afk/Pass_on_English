-- Live estimates are for an unfinished month and cannot yet satisfy the
-- three-full-month attendance condition. Recalculate them through the app;
-- immediately remove any previously persisted premature quarterly bonus.
UPDATE public.teacher_salary_statements
SET quarterly_bonus = 0,
    updated_at = now()
WHERE is_live_estimate = true
  AND quarterly_bonus <> 0;
