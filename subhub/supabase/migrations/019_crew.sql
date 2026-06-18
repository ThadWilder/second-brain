-- 019_crew.sql
-- "Build Your Crew" — the contractor retention mechanic and core differentiator.
--
-- A contractor adds a proven sub to their crew once the pair clears an
-- eligibility threshold (completed jobs together AND total payout earned).
-- Crew members get a priority window on new job posts: the job is visible
-- and claimable only by the contractor's active crew until the window expires,
-- then it opens to the general board.
--
-- Eligibility and slot limits are enforced SERVER-SIDE via SECURITY DEFINER
-- RPCs so crew status can never be faked from the client.
--
-- Thresholds below are deliberate placeholders — tune against real job data.

-- ── crew slots on contractor profile (tier-gated capacity) ──
alter table contractor_profiles
  add column if not exists crew_slots int not null default 3;

-- ── crew priority window on jobs ──
-- When set and still in the future, only the contractor's active crew can
-- see and claim the job. Null (or past) = open to the whole board.
alter table jobs
  add column if not exists crew_priority_until timestamptz;

create index if not exists jobs_crew_priority_idx
  on jobs(crew_priority_until) where status = 'posted';

-- ── crew_members ──
create table if not exists crew_members (
  id               uuid primary key default uuid_generate_v4(),
  contractor_id    uuid references auth.users(id) on delete cascade not null,
  sub_id           uuid references auth.users(id) on delete cascade not null,
  status           text not null default 'active'
                     check (status in ('active', 'at_risk', 'removed')),
  jobs_together    int not null default 0,
  dollars_together numeric(12,2) not null default 0,
  added_at         timestamptz not null default now(),
  last_job_at      timestamptz,
  created_at       timestamptz not null default now(),
  unique(contractor_id, sub_id)
);

create index if not exists crew_members_contractor_idx on crew_members(contractor_id, status);
create index if not exists crew_members_sub_idx on crew_members(sub_id, status);

-- ── pair stats helper: completed jobs + dollars between a contractor & sub ──
create or replace function crew_pair_stats(p_contractor uuid, p_sub uuid)
returns table(jobs_together int, dollars_together numeric, last_job_at timestamptz)
language sql stable as $$
  select
    count(*)::int,
    coalesce(sum(sub_payout), 0)::numeric,
    max(completed_at)
  from jobs
  where contractor_id = p_contractor
    and claimed_by = p_sub
    and status = 'complete';
$$;

-- ── crew candidates: eligible subs not already on the caller's crew ──
-- SECURITY DEFINER so it can aggregate across the contractor's job history.
create or replace function crew_candidates()
returns table(sub_id uuid, jobs_together int, dollars_together numeric, last_job_at timestamptz)
language sql stable security definer set search_path = public as $$
  select
    j.claimed_by,
    count(*)::int,
    coalesce(sum(j.sub_payout), 0)::numeric,
    max(j.completed_at)
  from jobs j
  where j.contractor_id = auth.uid()
    and j.status = 'complete'
    and j.claimed_by is not null
    and not exists (
      select 1 from crew_members cm
      where cm.contractor_id = auth.uid()
        and cm.sub_id = j.claimed_by
        and cm.status <> 'removed'
    )
  group by j.claimed_by
  having count(*) >= 3 and coalesce(sum(j.sub_payout), 0) >= 5000;
$$;

-- ── add to crew (server-authoritative: validates eligibility + open slot) ──
create or replace function add_to_crew(p_sub uuid)
returns crew_members
language plpgsql security definer set search_path = public as $$
declare
  v_contractor   uuid := auth.uid();
  v_stats        record;
  v_slots        int;
  v_used         int;
  v_row          crew_members;
  c_min_jobs     constant int := 3;
  c_min_dollars  constant numeric := 5000;
begin
  if v_contractor is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from contractor_profiles where user_id = v_contractor) then
    raise exception 'Only contractors can build a crew';
  end if;

  select * into v_stats from crew_pair_stats(v_contractor, p_sub);

  if v_stats.jobs_together < c_min_jobs or v_stats.dollars_together < c_min_dollars then
    raise exception 'Sub is not yet crew-eligible (needs % completed jobs and $% together)',
      c_min_jobs, c_min_dollars;
  end if;

  select crew_slots into v_slots from contractor_profiles where user_id = v_contractor;
  select count(*) into v_used from crew_members
    where contractor_id = v_contractor and status <> 'removed';
  if v_used >= v_slots then
    raise exception 'No open crew slots (% of % used). Upgrade your plan for more slots.',
      v_used, v_slots;
  end if;

  insert into crew_members (contractor_id, sub_id, status, jobs_together, dollars_together, last_job_at)
  values (v_contractor, p_sub, 'active', v_stats.jobs_together, v_stats.dollars_together, v_stats.last_job_at)
  on conflict (contractor_id, sub_id) do update
    set status           = 'active',
        jobs_together    = excluded.jobs_together,
        dollars_together = excluded.dollars_together,
        last_job_at      = excluded.last_job_at
  returning * into v_row;

  return v_row;
end;
$$;

-- ── remove from crew ──
create or replace function remove_from_crew(p_sub uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_contractor uuid := auth.uid();
begin
  if v_contractor is null then raise exception 'Not authenticated'; end if;
  delete from crew_members where contractor_id = v_contractor and sub_id = p_sub;
end;
$$;

-- ── refresh crew stats automatically when a job completes ──
create or replace function refresh_crew_stats() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_stats record;
begin
  if new.status = 'complete'
     and old.status is distinct from 'complete'
     and new.claimed_by is not null
     and exists (
       select 1 from crew_members
       where contractor_id = new.contractor_id and sub_id = new.claimed_by
     )
  then
    select * into v_stats from crew_pair_stats(new.contractor_id, new.claimed_by);
    update crew_members
      set jobs_together    = v_stats.jobs_together,
          dollars_together = v_stats.dollars_together,
          last_job_at      = v_stats.last_job_at,
          status           = case when status = 'at_risk' then 'active' else status end
      where contractor_id = new.contractor_id and sub_id = new.claimed_by;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_refresh_crew_stats on jobs;
create trigger trg_refresh_crew_stats
  after update on jobs
  for each row execute function refresh_crew_stats();

-- ── maintenance: flag crew with no completed job in 90 days as 'at_risk' ──
-- Intended to be invoked periodically (cron). The contractor is then prompted
-- to keep or drop the relationship rather than the system silently removing it.
create or replace function flag_stale_crew() returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update crew_members
    set status = 'at_risk'
    where status = 'active'
      and added_at < now() - interval '90 days'
      and (last_job_at is null or last_job_at < now() - interval '90 days');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table crew_members enable row level security;

-- contractor manages own crew; subs can read crews they belong to
create policy "crew_members_contractor" on crew_members
  for all using (auth.uid() = contractor_id);
create policy "crew_members_sub_read" on crew_members
  for select using (auth.uid() = sub_id);

-- ── jobs visibility now honors the crew priority window ──
drop policy if exists "jobs_sub_read_posted" on jobs;
create policy "jobs_sub_read_posted" on jobs
  for select using (
    claimed_by = auth.uid()
    or (
      status = 'posted' and (
        crew_priority_until is null
        or crew_priority_until < now()
        or exists (
          select 1 from crew_members cm
          where cm.contractor_id = jobs.contractor_id
            and cm.sub_id = auth.uid()
            and cm.status = 'active'
        )
      )
    )
  );

-- ── claiming is blocked during another sub's priority window ──
drop policy if exists "jobs_sub_update_claim" on jobs;
create policy "jobs_sub_update_claim" on jobs
  for update using (
    status = 'posted' and claimed_by is null and (
      crew_priority_until is null
      or crew_priority_until < now()
      or exists (
        select 1 from crew_members cm
        where cm.contractor_id = jobs.contractor_id
          and cm.sub_id = auth.uid()
          and cm.status = 'active'
      )
    )
  )
  with check (claimed_by = auth.uid());
