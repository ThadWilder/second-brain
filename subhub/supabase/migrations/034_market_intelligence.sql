-- 034_market_intelligence.sql
-- Read-only aggregate RPCs that power the Market Pulse / Market Opportunities
-- screens. All functions are STABLE SECURITY DEFINER so they execute with the
-- definer's search_path and bypass per-row RLS — intentional, since we return
-- only aggregate statistics (no individual job or user data).

-- ── Job demand by state ───────────────────────────────────────────────────────
-- Returns states active in the last p_days days, ranked by jobs posted.
-- fill_rate = percentage of posted jobs that were claimed.
-- avg_hours_to_claim = mean hours from posted → claimed (claimed jobs only).
create or replace function public.market_stats_by_state(p_days int default 30)
returns table (
  state              text,
  posted             bigint,
  claimed            bigint,
  fill_rate          numeric,
  avg_payout         numeric,
  avg_hours_to_claim numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    j.state,
    count(*)                                                        as posted,
    count(*) filter (where j.claimed_at is not null)               as claimed,
    round(
      100.0
        * count(*) filter (where j.claimed_at is not null)::numeric
        / nullif(count(*), 0),
      1
    )                                                               as fill_rate,
    round(avg(j.sub_payout)::numeric, 0)                           as avg_payout,
    round(
      avg(
        extract(epoch from (j.claimed_at - j.created_at)) / 3600.0
      ) filter (where j.claimed_at is not null)::numeric,
      1
    )                                                               as avg_hours_to_claim
  from jobs j
  where j.created_at >= now() - (p_days || ' days')::interval
    and j.status::text not in ('draft', 'cancelled')
  group by j.state
  order by posted desc
  limit 30;
$$;

-- ── Job demand by industry (trade) ───────────────────────────────────────────
create or replace function public.market_stats_by_industry(p_days int default 30)
returns table (
  industry   text,
  posted     bigint,
  claimed    bigint,
  fill_rate  numeric,
  avg_payout numeric,
  avg_days   numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    j.industry,
    count(*)                                                        as posted,
    count(*) filter (where j.claimed_at is not null)               as claimed,
    round(
      100.0
        * count(*) filter (where j.claimed_at is not null)::numeric
        / nullif(count(*), 0),
      1
    )                                                               as fill_rate,
    round(avg(j.sub_payout)::numeric, 0)                           as avg_payout,
    round(avg(j.estimated_days)::numeric, 1)                       as avg_days
  from jobs j
  where j.created_at >= now() - (p_days || ' days')::interval
    and j.status::text not in ('draft', 'cancelled')
  group by j.industry
  order by posted desc;
$$;

-- ── Platform-wide summary ────────────────────────────────────────────────────
-- Returns a single JSON object with headline numbers for the period.
create or replace function public.market_summary(p_days int default 30)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'period_days',    p_days,
    'jobs_posted',    count(*),
    'jobs_open',      count(*) filter (where status = 'posted'),
    'jobs_claimed',   count(*) filter (where claimed_at is not null),
    'fill_rate',      round(
                        100.0
                          * count(*) filter (where claimed_at is not null)::numeric
                          / nullif(count(*), 0),
                        1
                      ),
    'avg_payout',     round(avg(sub_payout)::numeric, 0),
    'active_states',  count(distinct state),
    'active_trades',  count(distinct industry)
  )
  from jobs
  where created_at >= now() - (p_days || ' days')::interval
    and status::text not in ('draft', 'cancelled');
$$;

-- ── Grant anon + authenticated roles read access ─────────────────────────────
grant execute on function public.market_stats_by_state(int)   to anon, authenticated;
grant execute on function public.market_stats_by_industry(int) to anon, authenticated;
grant execute on function public.market_summary(int)           to anon, authenticated;
