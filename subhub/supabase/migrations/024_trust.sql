-- 024_trust.sql
-- Two trust mechanics from the blueprint:
--   • Backed By — a capped, reputation-costing peer vouch for a user already
--     on the platform. A personal endorsement, never a platform certification.
--   • Diversification Score — a parallel metric to Crew that rewards healthy
--     breadth across many contractors (anti-concentration), weighing balance
--     not raw count. Always a smaller, secondary signal than Crew priority.

-- ── Backed By vouches ──
create table if not exists vouches (
  id          uuid primary key default gen_random_uuid(),
  voucher_id  uuid references auth.users(id) on delete cascade not null,
  vouchee_id  uuid references auth.users(id) on delete cascade not null,
  note        text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique(voucher_id, vouchee_id)
);

create index if not exists vouches_vouchee_idx on vouches(vouchee_id, active);

-- Each account may hold a limited number of active vouches at once, keeping a
-- Backed By endorsement scarce and meaningful.
create or replace function add_vouch(p_vouchee uuid, p_note text default null)
returns vouches
language plpgsql security definer set search_path = public as $$
declare
  v_voucher uuid := auth.uid();
  v_active  int;
  v_row     vouches;
  c_cap     constant int := 5;
begin
  if v_voucher is null then raise exception 'Not authenticated'; end if;
  if v_voucher = p_vouchee then raise exception 'You cannot vouch for yourself'; end if;

  select count(*) into v_active from vouches where voucher_id = v_voucher and active;
  if v_active >= c_cap then
    raise exception 'You have reached your % active Backed By limit. Remove one to add another.', c_cap;
  end if;

  insert into vouches (voucher_id, vouchee_id, note, active)
  values (v_voucher, p_vouchee, p_note, true)
  on conflict (voucher_id, vouchee_id) do update set active = true, note = excluded.note
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function remove_vouch(p_vouchee uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  delete from vouches where voucher_id = auth.uid() and vouchee_id = p_vouchee;
end;
$$;

-- Vouchers who back this user (for the "Backed By" row on a profile).
create or replace function vouches_for(p_user uuid)
returns table(voucher_id uuid, note text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select voucher_id, note, created_at from vouches
  where vouchee_id = p_user and active
  order by created_at desc;
$$;

-- Reputational cost: when a vouchee gets a poor rating (<=2 stars), log it
-- against each of their active vouchers so a vouch carries real downside,
-- the way a professional reference does.
create table if not exists vouch_events (
  id         uuid primary key default gen_random_uuid(),
  voucher_id uuid references auth.users(id) on delete cascade not null,
  vouchee_id uuid references auth.users(id) on delete cascade not null,
  job_id     uuid references jobs(id) on delete set null,
  stars      int,
  created_at timestamptz not null default now()
);

create or replace function on_rating_vouch_cost() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stars <= 2 then
    insert into vouch_events (voucher_id, vouchee_id, job_id, stars)
    select v.voucher_id, new.ratee_id, new.job_id, new.stars
    from vouches v
    where v.vouchee_id = new.ratee_id and v.active;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vouch_cost on ratings;
create trigger trg_vouch_cost
  after insert on ratings
  for each row execute function on_rating_vouch_cost();

-- ── Diversification Score ──
-- Breadth + balance across contractors over a trailing 6 months, expressed
-- 0-100. Uses a Herfindahl-style concentration: a sub whose volume is spread
-- in reasonable proportion across 3-5 contractors scores high; one job each
-- across many (scattered) or all volume with one (concentrated) scores low.
alter table sub_profiles
  add column if not exists diversification_score int;

create or replace function diversification_score(p_sub uuid)
returns int language plpgsql stable security definer set search_path = public as $$
declare
  v_total   numeric;
  v_hhi     numeric;
  v_n       int;
  v_balance numeric;
begin
  select coalesce(sum(sub_payout),0), count(distinct contractor_id)
    into v_total, v_n
  from jobs
  where claimed_by = p_sub and status = 'complete'
    and completed_at >= now() - interval '6 months';

  if v_total = 0 or v_n = 0 then return null; end if;
  if v_n = 1 then return 0; end if;

  -- Herfindahl index of payout share per contractor (1/n .. 1).
  select sum(power(share, 2)) into v_hhi from (
    select sum(sub_payout)/v_total as share
    from jobs
    where claimed_by = p_sub and status = 'complete'
      and completed_at >= now() - interval '6 months'
    group by contractor_id
  ) s;

  -- Normalize: perfectly balanced (hhi = 1/n) → 1; fully concentrated → 0.
  v_balance := (1 - v_hhi) / nullif(1 - (1.0 / v_n), 0);

  -- Reward having 3-5 contractors; taper scattered (1 job each) via balance.
  return greatest(0, least(100, round(v_balance * least(v_n, 5) / 5.0 * 100)))::int;
end;
$$;

alter table vouches      enable row level security;
alter table vouch_events enable row level security;

create policy "vouches_read"   on vouches for select using (true);
create policy "vouches_manage" on vouches for all
  using (auth.uid() = voucher_id) with check (auth.uid() = voucher_id);
create policy "vouch_events_own" on vouch_events
  for select using (auth.uid() = voucher_id or auth.uid() = vouchee_id);
