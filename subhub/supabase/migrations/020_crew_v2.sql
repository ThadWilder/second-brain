-- 020_crew_v2.sql
-- Crew mechanic brought to full blueprint spec:
--   • three-part eligibility: jobs together AND dollars together AND mutual rating
--   • rolling-window maintenance (trailing 3 months) instead of a flat idle timer
--   • subscription tiers that unlock crew slots (primary monetization lever)
--   • crew-aware overflow: a second priority tier (other contractors' highly
--     rated crew in the same trade) before a job opens to the whole board
--
-- All eligibility/slot logic stays SERVER-SIDE (SECURITY DEFINER) so crew
-- status can never be faked from the client.

-- ── thresholds (tune against real data) ──
-- jobs: 3, dollars: 5000 (from 019); add a minimum mutual star rating.
-- Kept in lib/crew.ts for display copy only; server is authoritative.

-- ── subscription tier → crew slot capacity ──
alter table contractor_profiles
  add column if not exists subscription_tier text not null default 'starter'
    check (subscription_tier in ('starter', 'pro', 'crew_builder'));

-- Map tier → slots. Changing tier resets crew_slots to the tier default.
create or replace function tier_slot_count(p_tier text)
returns int language sql immutable as $$
  select case p_tier
    when 'crew_builder' then 15
    when 'pro'          then 7
    else 3
  end;
$$;

create or replace function set_subscription_tier(p_tier text)
returns contractor_profiles
language plpgsql security definer set search_path = public as $$
declare v_row contractor_profiles;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_tier not in ('starter','pro','crew_builder') then
    raise exception 'Unknown tier %', p_tier;
  end if;
  update contractor_profiles
     set subscription_tier = p_tier,
         crew_slots        = tier_slot_count(p_tier)
   where user_id = auth.uid()
   returning * into v_row;
  return v_row;
end;
$$;

-- ── mutual rating between a contractor and a sub (both directions) ──
create or replace function crew_pair_rating(p_contractor uuid, p_sub uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(avg(r.stars), 0)::numeric
  from ratings r
  join jobs j on j.id = r.job_id
  where j.contractor_id = p_contractor
    and j.claimed_by = p_sub
    and ((r.rater_id = p_contractor and r.ratee_id = p_sub)
      or (r.rater_id = p_sub and r.ratee_id = p_contractor));
$$;

-- ── candidates now also require a minimum mutual rating ──
create or replace function crew_candidates()
returns table(sub_id uuid, jobs_together int, dollars_together numeric, last_job_at timestamptz, mutual_rating numeric)
language sql stable security definer set search_path = public as $$
  select
    j.claimed_by,
    count(*)::int,
    coalesce(sum(j.sub_payout), 0)::numeric,
    max(j.completed_at),
    crew_pair_rating(auth.uid(), j.claimed_by)
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
  having count(*) >= 3
     and coalesce(sum(j.sub_payout), 0) >= 5000
     and crew_pair_rating(auth.uid(), j.claimed_by) >= 4.0;
$$;

-- ── add_to_crew now validates the rating threshold too ──
create or replace function add_to_crew(p_sub uuid)
returns crew_members
language plpgsql security definer set search_path = public as $$
declare
  v_contractor   uuid := auth.uid();
  v_stats        record;
  v_rating       numeric;
  v_slots        int;
  v_used         int;
  v_row          crew_members;
  c_min_jobs     constant int := 3;
  c_min_dollars  constant numeric := 5000;
  c_min_rating   constant numeric := 4.0;
begin
  if v_contractor is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from contractor_profiles where user_id = v_contractor) then
    raise exception 'Only contractors can build a crew';
  end if;

  select * into v_stats from crew_pair_stats(v_contractor, p_sub);
  v_rating := crew_pair_rating(v_contractor, p_sub);

  if v_stats.jobs_together < c_min_jobs
     or v_stats.dollars_together < c_min_dollars
     or v_rating < c_min_rating then
    raise exception 'Sub is not yet crew-eligible (needs % jobs, $%, and a % star mutual rating)',
      c_min_jobs, c_min_dollars, c_min_rating;
  end if;

  select crew_slots into v_slots from contractor_profiles where user_id = v_contractor;
  select count(*) into v_used from crew_members
    where contractor_id = v_contractor and status <> 'removed';
  if v_used >= v_slots then
    raise exception 'No open crew slots (% of % used). Upgrade your plan for more slots.', v_used, v_slots;
  end if;

  insert into crew_members (contractor_id, sub_id, status, jobs_together, dollars_together, last_job_at)
  values (v_contractor, p_sub, 'active', v_stats.jobs_together, v_stats.dollars_together, v_stats.last_job_at)
  on conflict (contractor_id, sub_id) do update
    set status = 'active', jobs_together = excluded.jobs_together,
        dollars_together = excluded.dollars_together, last_job_at = excluded.last_job_at
  returning * into v_row;
  return v_row;
end;
$$;

-- ── rolling-window maintenance ──
-- A pair must keep at least 80% of the qualifying job pace over a trailing
-- 3 months (i.e. >= ceil(0.8 * min_jobs) completed jobs in the window).
-- Falling short flags 'at_risk' (a contractor prompt), never auto-removal.
create or replace function maintain_crew_status() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count       int;
  c_min_jobs    constant int := 3;
  c_window_jobs constant int := 2;  -- ceil(0.8 * 3)
begin
  -- demote pairs that fell below the trailing-3-month pace
  update crew_members cm
     set status = 'at_risk'
   where cm.status = 'active'
     and cm.added_at < now() - interval '3 months'
     and (
       select count(*) from jobs j
        where j.contractor_id = cm.contractor_id
          and j.claimed_by = cm.sub_id
          and j.status = 'complete'
          and j.completed_at >= now() - interval '3 months'
     ) < c_window_jobs;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ── crew-aware overflow ──
-- Optional second priority tier on a job: after the owner's crew window, the
-- job opens to *other* contractors' active crew members in the same trade who
-- carry a strong rating, before finally opening to the general board.
alter table jobs
  add column if not exists overflow_until timestamptz;

-- Is this sub an overflow-eligible crew member for this job's trade?
-- (Active crew of any contractor, sub rating >= 4.5, matching industry.)
create or replace function sub_is_overflow_eligible(p_job uuid, p_sub uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from crew_members cm
    join sub_profiles sp on sp.user_id = cm.sub_id
    join jobs j on j.id = p_job
    where cm.sub_id = p_sub
      and cm.status = 'active'
      and coalesce(sp.rating, 0) >= 4.5
      and (sp.skills is null or j.industry = any(sp.skills) or array_length(sp.skills,1) is null)
  );
$$;

-- Refresh the sub read/claim policies to honor crew → overflow → board.
drop policy if exists "jobs_sub_read_posted" on jobs;
create policy "jobs_sub_read_posted" on jobs
  for select using (
    claimed_by = auth.uid()
    or (
      status = 'posted' and (
        (crew_priority_until is null or crew_priority_until < now())
        and (overflow_until is null or overflow_until < now())
        or exists (
          select 1 from crew_members cm
          where cm.contractor_id = jobs.contractor_id
            and cm.sub_id = auth.uid()
            and cm.status = 'active'
        )
        or (overflow_until is not null and overflow_until >= now()
            and sub_is_overflow_eligible(jobs.id, auth.uid()))
      )
    )
  );

drop policy if exists "jobs_sub_update_claim" on jobs;
create policy "jobs_sub_update_claim" on jobs
  for update using (
    status = 'posted' and claimed_by is null and (
      (crew_priority_until is null or crew_priority_until < now())
      and (overflow_until is null or overflow_until < now())
      or exists (
        select 1 from crew_members cm
        where cm.contractor_id = jobs.contractor_id
          and cm.sub_id = auth.uid()
          and cm.status = 'active'
      )
      or (overflow_until is not null and overflow_until >= now()
          and sub_is_overflow_eligible(jobs.id, auth.uid()))
    )
  )
  with check (claimed_by = auth.uid());
