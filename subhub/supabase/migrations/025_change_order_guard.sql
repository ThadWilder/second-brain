-- 025_change_order_guard.sql
-- Change-order integrity from the blueprint:
--   • Scope change markup — the platform takes a percentage of the value delta
--     on a change order, set SERVER-SIDE so it can't be zeroed from the client.
--   • Change-order gaming safeguards — flag contractors not just on raw change
--     frequency, but on change-order dollar value as a % of the original posted
--     job value (catches systematic underscoping below a frequency alarm).

-- Platform markup captured on each change order (percentage of the delta).
alter table change_orders
  add column if not exists value_delta     numeric(12,2) not null default 0,
  add column if not exists platform_markup numeric(12,2) not null default 0;

-- Stamp value_delta + markup server-side whenever a change order is written.
-- SCOPE_MARKUP_PCT is the platform's cut of the change value delta.
create or replace function stamp_change_order_markup() returns trigger
language plpgsql security definer set search_path = public as $$
declare c_markup_pct constant numeric := 0.10;  -- 10% of the change delta
begin
  new.value_delta     := coalesce(new.total_adjustment, 0);
  new.platform_markup := round(greatest(new.value_delta, 0) * c_markup_pct, 2);
  return new;
end;
$$;

drop trigger if exists trg_change_order_markup on change_orders;
create trigger trg_change_order_markup
  before insert or update on change_orders
  for each row execute function stamp_change_order_markup();

-- Per-contractor change-order metrics over a trailing 6 months:
--   • frequency_pct  — share of their jobs that had >=1 change order
--   • avg_delta_pct  — avg change-order value as a % of original job payout
-- A contractor is flagged if EITHER signal is unusually high, so slight,
-- systematic underscoping (each change individually reasonable) still trips.
create or replace function contractor_change_metrics(p_contractor uuid)
returns table(
  total_jobs    int,
  jobs_with_co  int,
  frequency_pct numeric,
  avg_delta_pct numeric,
  flagged       boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  c_freq_threshold  constant numeric := 0.40;  -- >40% of jobs carry a change
  c_delta_threshold constant numeric := 0.15;  -- avg change >15% of job value
  v_total int; v_with int; v_freq numeric; v_delta numeric;
begin
  select count(*) into v_total
    from jobs
   where contractor_id = p_contractor
     and status = 'complete'
     and completed_at >= now() - interval '6 months';

  if coalesce(v_total,0) = 0 then
    return query select 0,0,0::numeric,0::numeric,false; return;
  end if;

  select count(distinct j.id) into v_with
    from jobs j join change_orders co on co.job_id = j.id
   where j.contractor_id = p_contractor
     and j.status = 'complete'
     and j.completed_at >= now() - interval '6 months';

  select coalesce(avg(co.value_delta / nullif(j.sub_payout,0)), 0) into v_delta
    from jobs j join change_orders co on co.job_id = j.id
   where j.contractor_id = p_contractor
     and j.status = 'complete'
     and j.completed_at >= now() - interval '6 months';

  v_freq := round(v_with::numeric / v_total, 3);
  v_delta := round(v_delta, 3);

  return query select
    v_total, v_with, v_freq, v_delta,
    (v_freq >= c_freq_threshold or v_delta >= c_delta_threshold);
end;
$$;
