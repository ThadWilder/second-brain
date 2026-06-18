-- 036_notifications.sql
-- Global in-app notification feed (the bell + dropdown tray). This is the
-- in-app counterpart to the server-side PUSH triggers (migrations 016 + 033):
-- push delivers an OS notification, this table backs the persistent feed the
-- user sees inside the app. The two are independent — this migration does NOT
-- touch the existing push triggers.
--
-- Rows are written exclusively via the SECURITY DEFINER helper
-- create_notification(), so other definer functions/triggers can log feed
-- items uniformly and end users never insert directly (no insert policy).

-- ── Table ───────────────────────────────────────────────────────────────────
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade not null,  -- recipient
  type       text not null,   -- 'message','claim_request','claim_accepted','change_order','signoff','payment','crew_eligible','dispute'
  title      text not null,
  body       text not null,
  job_id     uuid references jobs(id) on delete cascade,
  data       jsonb not null default '{}',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on notifications(user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on notifications(user_id) where read_at is null;

-- ── RLS ───────────────────────────────────────────────────────────────────--
alter table notifications enable row level security;

-- A user can read their own notifications.
drop policy if exists "notifications_select_own" on notifications;
create policy "notifications_select_own" on notifications
  for select using (auth.uid() = user_id);

-- A user can update their own notifications (only to mark them read).
drop policy if exists "notifications_update_own" on notifications;
create policy "notifications_update_own" on notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- No insert policy: rows are created only by SECURITY DEFINER functions / the
-- service role.

-- ── Helper: create a notification row (uniform entry point) ──────────────────
create or replace function public.create_notification(
  p_user  uuid,
  p_type  text,
  p_title text,
  p_body  text,
  p_job   uuid default null,
  p_data  jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (user_id, type, title, body, job_id, data)
  values (p_user, p_type, p_title, p_body, p_job, coalesce(p_data, '{}'));
end;
$$;

grant execute on function public.create_notification(uuid, text, text, text, uuid, jsonb) to authenticated;

-- ── Helper: mark all of the caller's notifications read ──────────────────────
create or replace function public.mark_all_notifications_read()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update notifications
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null;
end;
$$;

grant execute on function public.mark_all_notifications_read() to authenticated;

-- ── Trigger: log an in-app notification for the message recipient ────────────
-- Mirrors the recipient resolution in migration 016 (the OTHER job party), but
-- writes to the in-app feed instead of firing push. Kept separate from the push
-- trigger so neither affects the other.
create or replace function public.notify_message_recipient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor uuid;
  v_claimed_by uuid;
  v_recipient  uuid;
begin
  select contractor_id, claimed_by
    into v_contractor, v_claimed_by
  from jobs where id = new.job_id;

  -- recipient is whichever party did NOT send the message
  if new.sender_id = v_contractor then
    v_recipient := v_claimed_by;
  else
    v_recipient := v_contractor;
  end if;

  if v_recipient is null then
    return new;  -- job not claimed yet — nobody to notify
  end if;

  perform public.create_notification(
    v_recipient,
    'message',
    'New message',
    left(new.body, 80),
    new.job_id,
    '{}'::jsonb
  );

  return new;
end;
$$;

drop trigger if exists on_message_notification on messages;
create trigger on_message_notification
  after insert on messages
  for each row execute function public.notify_message_recipient();
