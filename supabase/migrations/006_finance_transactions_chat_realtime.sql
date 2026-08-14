-- Finance ledger + Realtime for chat messages
-- Uses gen_random_uuid() (Supabase: pgcrypto / PG13+) — NOT uuid_generate_v4()
-- which requires uuid-ossp in the extensions schema and often fails on db push.

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

-- 4.x finance_transactions (individual settlement records)
CREATE TABLE IF NOT EXISTS finance_transactions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  transaction_date date NOT NULL,
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  category text NOT NULL,
  description text NOT NULL,
  currency text NOT NULL CHECK (currency IN ('KRW', 'CNY', 'PHP')),
  amount numeric NOT NULL,
  amount_krw numeric NOT NULL,
  supply_amount numeric NOT NULL DEFAULT 0,
  vat_amount numeric NOT NULL DEFAULT 0,
  tax_treatment text NOT NULL,
  source text NOT NULL CHECK (source IN ('auto', 'manual')),
  teacher_id uuid REFERENCES teachers(id) ON DELETE SET NULL,
  teacher_name text,
  student_name text,
  enrollment_id uuid REFERENCES enrollments(id) ON DELETE SET NULL,
  salary_statement_id uuid REFERENCES teacher_salary_statements(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_transactions_date
  ON finance_transactions (transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_finance_transactions_category
  ON finance_transactions (category);

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_transactions_salary_statement
  ON finance_transactions (salary_statement_id)
  WHERE salary_statement_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_transactions_enrollment_income
  ON finance_transactions (enrollment_id)
  WHERE enrollment_id IS NOT NULL AND type = 'income';

-- Enable Supabase Realtime for chat_messages (idempotent)
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
  END IF;
END
$do$;
