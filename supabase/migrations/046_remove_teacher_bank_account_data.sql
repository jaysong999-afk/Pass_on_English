begin;

-- Teacher payout details are intentionally kept outside the application.
-- Drop historical sensitive values after the application no longer reads or writes them.
alter table public.teacher_applications
  drop column if exists bank_account;

alter table public.teacher_salary_statements
  drop column if exists payout_account;

commit;
