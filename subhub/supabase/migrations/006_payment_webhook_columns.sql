-- Columns written by the stripe-webhook Edge Function
ALTER TABLE payment_records
  ADD COLUMN IF NOT EXISTS charged_at    timestamptz,
  ADD COLUMN IF NOT EXISTS failure_reason text;
