-- Persist the complete admin payroll workflow. The application previously
-- exposed these fields but teacher_salary_statements could not store them.
ALTER TYPE salary_payout_status ADD VALUE IF NOT EXISTS 'completed';

ALTER TABLE teacher_salary_statements
  ADD COLUMN IF NOT EXISTS admin_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_confirmed_by text,
  ADD COLUMN IF NOT EXISTS php_paid_at date,
  ADD COLUMN IF NOT EXISTS krw_transfer_amount numeric,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS finance_transaction_id uuid;

