-- 039_feed_events.sql
-- Extend the in-app notification feed (migration 036) to every remaining
-- lifecycle event. These triggers are the FEED counterpart to the OS-push
-- triggers in migration 033: push delivers an OS notification, these write the
-- persistent rows the bell tray shows. They are deliberately separate from the
-- push triggers (distinct names) so neither affects the other, and all bail
-- silently if create_notification() is unavailable.
--
-- Covered here (messages + claim events are already covered by 036 + the claim
-- RPCs in 035):
--   change_orders INSERT            → notify the OTHER party
--   change_orders UPDATE → approved → notify both parties
--   disputes INSERT                 → notify the OTHER party
--   jobs UPDATE → pending_review    → notify contractor (sign-off submitted)
--   jobs UPDATE → complete          → notify sub (job closed out)
--   payment_records UPDATE→released → notify sub (paid)
--   job_invites INSERT              → notify the invited sub
--
-- Also adds jobs.archived for the contractor "Archive" swipe action in My Jobs.

-- ── jobs.archived (My Jobs swipe-to-archive) ─────────────────────────────────
alter table jobs add column if not exists archived boolean not null default false;
comment on column jobs.archived is
  'Contractor-hidden from the My Jobs list (swipe-to-archive). Does not affect the sub board or history.';

-- ── 1. Change order filed (INSERT) → notify the other party ──────────────────
create or replace function public.feed_on_change_order_filed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_contractor uuid; v_claimed_by uuid; v_title text; v_recipient uuid;
begin
  select contractor_id, claimed_by, title
    into v_contractor, v_claimed_by, v_title
  from jobs where id = new.job_id;

  if new.initiated_by = v_contractor then v_recipient := v_claimed_by;
  else v_recipient := v_contractor; end if;
  if v_recipient is null then return new; end if;

  perform public.create_notification(
    v_recipient, 'change_order', 'Change order filed',
    'Review the change for "' || coalesce(v_title, 'your job') || '"',
    new.job_id, '{}'::jsonb);
  return new;
end;
$$;

drop trigger if exists feed_change_order_insert on change_orders;
create trigger feed_change_order_insert
  after insert on change_orders
  for each row execute function public.feed_on_change_order_filed();

-- ── 2. Change order approved (UPDATE → approved) → notify both ───────────────
create or replace function public.feed_on_change_order_approved()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_contractor uuid; v_claimed_by uuid; v_title text;
begin
  if new.status <> 'approved' or old.status = 'approved' then return new; end if;

  select contractor_id, claimed_by, title
    into v_contractor, v_claimed_by, v_title
  from jobs where id = new.job_id;

  if v_contractor is not null then
    perform public.create_notification(
      v_contractor, 'change_order', 'Change order approved',
      'Both parties approved the change for "' || coalesce(v_title, 'your job') || '"',
      new.job_id, '{}'::jsonb);
  end if;
  if v_claimed_by is not null then
    perform public.create_notification(
      v_claimed_by, 'change_order', 'Change order approved',
      'Both parties approved the change for "' || coalesce(v_title, 'your job') || '"',
      new.job_id, '{}'::jsonb);
  end if;
  return new;
end;
$$;

drop trigger if exists feed_change_order_approved on change_orders;
create trigger feed_change_order_approved
  after update on change_orders
  for each row execute function public.feed_on_change_order_approved();

-- ── 3. Dispute opened (INSERT) → notify the other party ──────────────────────
create or replace function public.feed_on_dispute_opened()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_contractor uuid; v_claimed_by uuid; v_title text; v_recipient uuid;
begin
  select contractor_id, claimed_by, title
    into v_contractor, v_claimed_by, v_title
  from jobs where id = new.job_id;

  if new.opened_by = v_contractor then v_recipient := v_claimed_by;
  else v_recipient := v_contractor; end if;
  if v_recipient is null then return new; end if;

  perform public.create_notification(
    v_recipient, 'dispute', '⚠️ Dispute opened',
    'A dispute was opened on "' || coalesce(v_title, 'your job') || '"',
    new.job_id, '{}'::jsonb);
  return new;
end;
$$;

drop trigger if exists feed_dispute_insert on disputes;
create trigger feed_dispute_insert
  after insert on disputes
  for each row execute function public.feed_on_dispute_opened();

-- ── 4. Job status: pending_review → contractor, complete → sub ───────────────
create or replace function public.feed_on_job_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = new.status then return new; end if;

  -- Sub submitted sign-off / marked complete → notify contractor.
  if new.status = 'pending_review' then
    perform public.create_notification(
      new.contractor_id, 'signoff', 'Job marked complete',
      '"' || new.title || '" is ready for your review',
      new.id, '{}'::jsonb);
  end if;

  -- Job closed out → notify the sub.
  if new.status = 'complete' and new.claimed_by is not null then
    perform public.create_notification(
      new.claimed_by, 'job_complete', 'Job closed out ✅',
      '"' || new.title || '" is complete.',
      new.id, '{}'::jsonb);
  end if;

  return new;
end;
$$;

drop trigger if exists feed_job_status on jobs;
create trigger feed_job_status
  after update on jobs
  for each row execute function public.feed_on_job_status();

-- ── 5. Payment released → notify the sub ─────────────────────────────────────
create or replace function public.feed_on_payment_released()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  if new.status <> 'released' or old.status = 'released' then return new; end if;
  select title into v_title from jobs where id = new.job_id;

  perform public.create_notification(
    new.sub_id, 'payment', 'Payment released 💸',
    'You were paid for "' || coalesce(v_title, 'a job') || '". Check Earnings for details.',
    new.job_id, '{}'::jsonb);
  return new;
end;
$$;

drop trigger if exists feed_payment_released on payment_records;
create trigger feed_payment_released
  after update on payment_records
  for each row execute function public.feed_on_payment_released();

-- ── 6. Job invite (INSERT) → notify the invited sub ──────────────────────────
-- job_invites.sub_id → sub_profiles.id; resolve to the auth user_id.
create or replace function public.feed_on_job_invite()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_sub_user uuid; v_biz text; v_title text;
begin
  select user_id into v_sub_user from sub_profiles where id = new.sub_id;
  if v_sub_user is null then return new; end if;

  select business_name into v_biz from contractor_profiles where id = new.contractor_id;
  select title into v_title from jobs where id = new.job_id;

  perform public.create_notification(
    v_sub_user, 'job_invite', '📨 Job invitation',
    coalesce(v_biz, 'A contractor') || ' invited you to "' || coalesce(v_title, 'a job') || '"',
    new.job_id, '{}'::jsonb);
  return new;
end;
$$;

drop trigger if exists feed_job_invite_insert on job_invites;
create trigger feed_job_invite_insert
  after insert on job_invites
  for each row execute function public.feed_on_job_invite();
