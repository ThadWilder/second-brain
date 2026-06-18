-- 035_claim_approval.sql
-- Contractor claim approval (blueprint signup_to_payout flow): a sub no longer
-- self-assigns a posted job. Instead the sub SUBMITS A CLAIM REQUEST, the
-- contractor reviews the sub's profile/rating/history, then ACCEPTS or DECLINES.
-- Only on accept does the job move posted → claimed.
--
-- Enforced entirely server-side via SECURITY DEFINER RPCs so the approval step
-- cannot be bypassed from the client (the direct sub self-claim RLS policy is
-- dropped below). create_notification() (migration 036) backs the in-app feed;
-- it is called at runtime only, so the 035-before-036 ordering is safe.

-- ── Columns ──────────────────────────────────────────────────────────────────
alter table jobs
  add column if not exists pending_claim_by   uuid references auth.users(id),
  add column if not exists claim_requested_at timestamptz;

create index if not exists jobs_pending_claim_idx on jobs(pending_claim_by) where pending_claim_by is not null;

comment on column jobs.pending_claim_by is
  'Sub who has requested to claim this posted job, awaiting contractor accept/decline. Null when no request is outstanding.';

-- ── RLS: remove direct self-claim, allow assigned sub to manage own job ──────
-- Claiming now flows through request_claim → accept_claim (SECURITY DEFINER),
-- so the sub never needs UPDATE rights to set claimed_by directly.
drop policy if exists "jobs_sub_update_claim" on jobs;

-- The assigned sub may update their OWN claimed job (start work, sign-off,
-- open dispute). `with check (claimed_by = auth.uid())` keeps them from
-- reassigning the job to anyone else.
drop policy if exists "jobs_sub_update_own_claimed" on jobs;
create policy "jobs_sub_update_own_claimed" on jobs
  for update using (claimed_by = auth.uid())
  with check (claimed_by = auth.uid());

-- ── request_claim: sub submits a claim request on a posted job ───────────────
create or replace function public.request_claim(p_job uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sub        uuid := auth.uid();
  v_job        record;
  v_sub_name   text;
begin
  if v_sub is null then raise exception 'Not authenticated'; end if;

  select * into v_job from jobs where id = p_job for update;
  if not found then raise exception 'Job not found'; end if;
  if v_job.status <> 'posted' or v_job.claimed_by is not null then
    raise exception 'This job is no longer available to claim';
  end if;
  if v_job.pending_claim_by is not null then
    if v_job.pending_claim_by = v_sub then return; end if;  -- idempotent re-request
    raise exception 'Another sub has a claim pending on this job';
  end if;

  update jobs
     set pending_claim_by = v_sub,
         claim_requested_at = now()
   where id = p_job;

  select name into v_sub_name from sub_profiles where user_id = v_sub;

  perform public.create_notification(
    v_job.contractor_id,
    'claim_request',
    'New claim request',
    coalesce(v_sub_name, 'A subcontractor') || ' wants to claim "' || v_job.title || '"',
    p_job,
    jsonb_build_object('sub_id', v_sub)
  );
end;
$$;

grant execute on function public.request_claim(uuid) to authenticated;

-- ── accept_claim: contractor approves the pending request ────────────────────
create or replace function public.accept_claim(p_job uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_job    record;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;

  select * into v_job from jobs where id = p_job for update;
  if not found then raise exception 'Job not found'; end if;
  if v_job.contractor_id <> v_caller then raise exception 'Only the posting contractor can accept'; end if;
  if v_job.pending_claim_by is null then raise exception 'No pending claim on this job'; end if;
  if v_job.status <> 'posted' or v_job.claimed_by is not null then
    raise exception 'This job is no longer open';
  end if;

  update jobs
     set claimed_by = v_job.pending_claim_by,
         claimed_at = now(),
         status = 'claimed',
         pending_claim_by = null,
         claim_requested_at = null
   where id = p_job;

  perform public.create_notification(
    v_job.pending_claim_by,
    'claim_accepted',
    'Claim accepted 🎉',
    'You''re cleared to start "' || v_job.title || '". It''s now in My Jobs.',
    p_job,
    '{}'::jsonb
  );
end;
$$;

grant execute on function public.accept_claim(uuid) to authenticated;

-- ── reject_claim: contractor declines the pending request ────────────────────
create or replace function public.reject_claim(p_job uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_job    record;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;

  select * into v_job from jobs where id = p_job for update;
  if not found then raise exception 'Job not found'; end if;
  if v_job.contractor_id <> v_caller then raise exception 'Only the posting contractor can decline'; end if;
  if v_job.pending_claim_by is null then return; end if;

  perform public.create_notification(
    v_job.pending_claim_by,
    'claim_rejected',
    'Claim not accepted',
    'The contractor went another direction on "' || v_job.title || '". It may still be open — check the board.',
    p_job,
    '{}'::jsonb
  );

  update jobs
     set pending_claim_by = null,
         claim_requested_at = null
   where id = p_job;
end;
$$;

grant execute on function public.reject_claim(uuid) to authenticated;
