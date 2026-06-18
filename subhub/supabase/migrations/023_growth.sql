-- 023_growth.sql
-- Cold-start / growth mechanics from the blueprint:
--   • Fee waiver — a fixed number of fee-free jobs for new users on both sides
--     (counted in jobs, not calendar time, so a slow start costs nothing).
--   • Referral links — every user has a personal code; two referral paths
--     (sub→sub, contractor→sub) grant a time-limited visibility boost.
--   • Visibility boosts — Tier-3 onboarding nudges that rank BELOW Crew
--     priority (Tier 1), never substituting for earned standing.

-- ── fee waiver counters ──
alter table contractor_profiles
  add column if not exists free_posts_remaining int not null default 3;
alter table sub_profiles
  add column if not exists free_payouts_remaining int not null default 3;

-- ── referral codes ──
alter table contractor_profiles
  add column if not exists referral_code text unique;
alter table sub_profiles
  add column if not exists referral_code text unique;

-- Short, human-shareable code generator (8 chars, no ambiguous glyphs).
create or replace function gen_referral_code()
returns text language sql volatile as $$
  select upper(substr(translate(encode(gen_random_bytes(8), 'base64'),
    '+/=lIO01', ''), 1, 8));
$$;

-- Backfill + default any missing codes.
update contractor_profiles set referral_code = gen_referral_code() where referral_code is null;
update sub_profiles        set referral_code = gen_referral_code() where referral_code is null;

-- ── referrals ledger ──
create table if not exists referrals (
  id            uuid primary key default gen_random_uuid(),
  referrer_id   uuid references auth.users(id) on delete cascade not null,
  referrer_role text not null check (referrer_role in ('contractor','subcontractor')),
  referred_id   uuid references auth.users(id) on delete cascade not null,
  code_used     text,
  status        text not null default 'pending' check (status in ('pending','completed')),
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  unique(referred_id)   -- a user can only be referred once
);

create index if not exists referrals_referrer_idx on referrals(referrer_id);

-- ── visibility boosts (Tier 3) ──
create table if not exists visibility_boosts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  kind       text not null check (kind in ('new_user','referral','referred','premium')),
  weight     numeric not null default 1.0,  -- always < Crew priority weighting
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists visibility_boosts_user_idx on visibility_boosts(user_id, expires_at);

-- Strongest currently-active boost weight for a user (0 if none).
create or replace function active_boost_weight(p_user uuid)
returns numeric language sql stable as $$
  select coalesce(max(weight), 0)
  from visibility_boosts
  where user_id = p_user and expires_at > now();
$$;

-- ── claim a referral at signup ──
-- Records the referral as pending and gives a brand-new *referred* sub an
-- immediate small "referred" boost (stronger when a contractor vouched them in
-- by referring them directly). Reward to the referrer is deferred until the
-- referred user completes their first job (grant_referral_reward).
create or replace function claim_referral(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user       uuid := auth.uid();
  v_ref_id     uuid;
  v_ref_role   text;
  v_boost      numeric;
  v_days       int;
begin
  if v_user is null or p_code is null then return; end if;

  select user_id, 'contractor' into v_ref_id, v_ref_role
    from contractor_profiles where referral_code = upper(p_code);
  if v_ref_id is null then
    select user_id, 'subcontractor' into v_ref_id, v_ref_role
      from sub_profiles where referral_code = upper(p_code);
  end if;
  if v_ref_id is null or v_ref_id = v_user then return; end if;  -- bad/self code

  insert into referrals (referrer_id, referrer_role, referred_id, code_used)
  values (v_ref_id, v_ref_role, v_user, upper(p_code))
  on conflict (referred_id) do nothing;

  -- A contractor-sourced referral is a stronger trust signal than sub→sub.
  if v_ref_role = 'contractor' then v_boost := 1.5; v_days := 14;
  else v_boost := 1.0; v_days := 7; end if;

  insert into visibility_boosts (user_id, kind, weight, expires_at)
  values (v_user, 'referred', v_boost, now() + (v_days || ' days')::interval);
end;
$$;

-- ── reward the referrer once the referred user completes a first job ──
create or replace function grant_referral_reward(p_referred uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_ref record;
begin
  select * into v_ref from referrals where referred_id = p_referred and status = 'pending';
  if not found then return; end if;

  update referrals set status = 'completed', completed_at = now() where id = v_ref.id;

  -- Standard referrer visibility boost on the board.
  insert into visibility_boosts (user_id, kind, weight, expires_at)
  values (v_ref.referrer_id, 'referral', 1.0, now() + interval '7 days');
end;
$$;

-- Fire the reward automatically on the referred user's first completed job.
create or replace function on_job_complete_referral() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'complete' and old.status is distinct from 'complete'
     and new.claimed_by is not null then
    -- only the *first* completion triggers it (grant is idempotent via status)
    perform grant_referral_reward(new.claimed_by);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_referral_reward on jobs;
create trigger trg_referral_reward
  after update on jobs
  for each row execute function on_job_complete_referral();

-- ── new-user boost on profile creation ──
-- A small, short boost so a brand-new account gets a fair first look.
create or replace function grant_new_user_boost(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into visibility_boosts (user_id, kind, weight, expires_at)
  values (p_user, 'new_user', 0.75, now() + interval '14 days');
end;
$$;

-- ── fee-status helper (read by UI + payout flow) ──
create or replace function my_fee_status()
returns table(role text, free_remaining int)
language sql stable security definer set search_path = public as $$
  select 'contractor', free_posts_remaining from contractor_profiles where user_id = auth.uid()
  union all
  select 'subcontractor', free_payouts_remaining from sub_profiles where user_id = auth.uid();
$$;

alter table referrals        enable row level security;
alter table visibility_boosts enable row level security;

create policy "referrals_mine" on referrals
  for select using (auth.uid() = referrer_id or auth.uid() = referred_id);
create policy "visibility_boosts_read" on visibility_boosts
  for select using (true);   -- boosts affect public board ranking
