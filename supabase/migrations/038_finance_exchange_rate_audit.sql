-- Persist the FX rate used for non-KRW ledger entries.  Revenue is recognised
-- at payment confirmation, so historical KRW values remain stable thereafter.
ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS exchange_rate numeric,
  ADD COLUMN IF NOT EXISTS exchange_rate_source text,
  ADD COLUMN IF NOT EXISTS exchange_rate_at timestamptz;

-- Older CN revenue rows were written with the CNY amount copied into amount_krw.
-- Repair only that unambiguous legacy shape using the application fallback rate;
-- newly recorded rows always store the confirmation-time rate above.
UPDATE finance_transactions
SET amount_krw = round(amount * 190.2),
    exchange_rate = 190.2,
    exchange_rate_source = 'legacy-fallback-190.2',
    exchange_rate_at = COALESCE(created_at, now())
WHERE currency = 'CNY'
  AND amount_krw = amount
  AND amount > 0;
