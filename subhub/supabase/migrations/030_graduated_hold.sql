-- 030_graduated_hold.sql
-- Graduated posting-hold amount for bulk / franchise posting.
--
-- A flat $1,000 hold per job is fine for a one-off post but punishing for a
-- franchise dropping 30 jobs at once. Instead:
--
--   • First job with an active hold  → $1,000  (establishes card liability)
--   • Each additional concurrent job → $250    (cheaper while one is in flight)
--
-- "Active hold" = jobs.hold_payment_intent_id IS NOT NULL. The id is nulled out
-- when a hold is released (job cancelled) or captured (job paid), so once all a
-- contractor's holds clear, their next post is $1,000 again.
--
-- The amount is computed SERVER-SIDE (SECURITY DEFINER) and is the single source
-- of truth the hold-payment edge function reads, so it can never be lowered from
-- the client. Returns the hold in CENTS (Stripe's unit).

create or replace function posting_hold_amount(p_contractor uuid)
returns int language sql stable security definer set search_path = public as $$
  select case
    when (
      select count(*) from jobs
       where contractor_id = p_contractor
         and hold_payment_intent_id is not null
    ) > 0
    then 25000     -- $250.00 — additional concurrent job
    else 100000    -- $1,000.00 — first active job
  end;
$$;
