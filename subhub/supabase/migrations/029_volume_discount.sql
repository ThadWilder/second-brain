-- 029_volume_discount.sql
-- Tier-0 incentive (loyalty volume discount): a contractor↔sub PAIR that
-- completes more jobs together earns a decreasing platform fee. This rewards
-- repeat relationships directly in the economics — the more a proven pair works
-- together, the less the platform takes from the sub's payout.
--
-- The base sub-side platform fee is 10% (see lib/fees.ts PLATFORM_FEE_PCT). The
-- discount lowers that fraction by completed-jobs-together count:
--
--   jobs together   sub fee
--   ────────────────────────
--   0 – 2           10%   (base — no relationship yet)
--   3 – 5            8%   (proven once — same threshold as crew eligibility)
--   6 – 9            6%   (loyal pair)
--   10+              5%   (loyalty floor — never goes lower)
--
-- The rate is computed SERVER-SIDE (SECURITY DEFINER) from the pair's completed
-- job history, so it can never be inflated from the client. It is the single
-- source of truth read by create-payment-intent when stamping platform_fee_sub.

-- ── pair fee tiers ──
-- Returns the platform fee FRACTION (e.g. 0.08) for a contractor/sub pair given
-- how many jobs they've completed together. Pure + immutable on its input.
create or replace function pair_fee_rate_for_count(p_jobs int)
returns numeric language sql immutable as $$
  select case
    when p_jobs >= 10 then 0.05
    when p_jobs >= 6  then 0.06
    when p_jobs >= 3  then 0.08
    else 0.10
  end;
$$;

-- Effective sub-side platform fee fraction for a specific pair, derived from
-- their completed-jobs-together count. SECURITY DEFINER so it can read across
-- the full job history regardless of the caller's RLS scope.
create or replace function pair_fee_rate(p_contractor uuid, p_sub uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select pair_fee_rate_for_count(
    (select count(*)::int
       from jobs
      where contractor_id = p_contractor
        and claimed_by = p_sub
        and status = 'complete')
  );
$$;

-- Loyalty status for the signed-in sub across every contractor they've worked
-- with: jobs completed together, the current fee rate, and the next tier (so the
-- UI can show "1 more job → 6% fee"). One row per contractor the sub has a
-- completed job with.
create or replace function my_pair_discounts()
returns table(
  contractor_id    uuid,
  business_name    text,
  jobs_together    int,
  current_rate     numeric,
  next_rate        numeric,
  jobs_to_next     int
)
language sql stable security definer set search_path = public as $$
  with pairs as (
    select j.contractor_id, count(*)::int as jobs_together
    from jobs j
    where j.claimed_by = auth.uid()
      and j.status = 'complete'
    group by j.contractor_id
  )
  select
    p.contractor_id,
    cp.business_name,
    p.jobs_together,
    pair_fee_rate_for_count(p.jobs_together) as current_rate,
    case
      when p.jobs_together >= 10 then null
      when p.jobs_together >= 6  then 0.05
      when p.jobs_together >= 3  then 0.06
      else 0.08
    end as next_rate,
    case
      when p.jobs_together >= 10 then null
      when p.jobs_together >= 6  then 10 - p.jobs_together
      when p.jobs_together >= 3  then 6  - p.jobs_together
      else 3 - p.jobs_together
    end as jobs_to_next
  from pairs p
  join contractor_profiles cp on cp.user_id = p.contractor_id
  order by p.jobs_together desc;
$$;

-- Single-pair lookup for the claim-confirm / contractor-detail screens: what
-- fee would this sub pay on a job from this contractor right now, and how many
-- more jobs until the next discount tier.
create or replace function pair_discount_status(p_contractor uuid)
returns table(jobs_together int, current_rate numeric, next_rate numeric, jobs_to_next int)
language sql stable security definer set search_path = public as $$
  with cnt as (
    select count(*)::int as jobs_together
    from jobs
    where contractor_id = p_contractor
      and claimed_by = auth.uid()
      and status = 'complete'
  )
  select
    c.jobs_together,
    pair_fee_rate_for_count(c.jobs_together),
    case
      when c.jobs_together >= 10 then null
      when c.jobs_together >= 6  then 0.05
      when c.jobs_together >= 3  then 0.06
      else 0.08
    end,
    case
      when c.jobs_together >= 10 then null
      when c.jobs_together >= 6  then 10 - c.jobs_together
      when c.jobs_together >= 3  then 6  - c.jobs_together
      else 3 - c.jobs_together
    end
  from cnt c;
$$;
