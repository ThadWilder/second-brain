-- 033_event_push_triggers.sql
-- Server-side push notifications for all key job lifecycle events. Uses the
-- same pg_net + Vault pattern as migration 016 (message push trigger). All
-- trigger functions are SECURITY DEFINER and bail silently when Vault secrets
-- are absent so dev/staging environments without Vault configuration still work.
--
-- Events covered:
--   jobs UPDATE  → claimed        : notify contractor (sub claimed)
--   jobs UPDATE  → pending_review : notify contractor (sub submitted work)
--   change_orders INSERT           : notify the OTHER party
--   change_orders UPDATE → approved: notify both parties
--   job_invites INSERT             : notify the sub
--   disputes INSERT                : notify the OTHER party

create extension if not exists pg_net with schema extensions;

-- ── Helper: fire a single send-notification call ────────────────────────────
-- Inlined into each trigger to avoid cross-function dependencies, but the
-- shared logic is identical to migration 016.

-- ── 1. Job status changes (claimed / pending_review) ────────────────────────
create or replace function public.notify_on_job_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_url      text;
  v_key      text;
  v_sub_name text;
begin
  if old.status = new.status then return new; end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
  if v_url is null or v_key is null then return new; end if;

  -- Sub just claimed the job → notify contractor
  if new.status = 'claimed' and old.status != 'claimed' and new.claimed_by is not null then
    select name into v_sub_name from sub_profiles where user_id = new.claimed_by;
    perform extensions.net.http_post(
      url     := v_url || '/functions/v1/send-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body    := jsonb_build_object(
        'userId', new.contractor_id,
        'title',  'Job Claimed',
        'body',   coalesce(v_sub_name, 'A sub') || ' claimed "' || new.title || '"',
        'data',   jsonb_build_object('type', 'job_claimed', 'jobId', new.id)
      )
    );
  end if;

  -- Sub marked work complete → notify contractor
  if new.status = 'pending_review' and old.status != 'pending_review' then
    perform extensions.net.http_post(
      url     := v_url || '/functions/v1/send-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body    := jsonb_build_object(
        'userId', new.contractor_id,
        'title',  'Job Marked Complete',
        'body',   '"' || new.title || '" is ready for your review',
        'data',   jsonb_build_object('type', 'job_complete', 'jobId', new.id)
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_job_status_change on jobs;
create trigger on_job_status_change
  after update on jobs
  for each row execute function public.notify_on_job_status_change();


-- ── 2. Change order filed (INSERT) ──────────────────────────────────────────
create or replace function public.notify_on_change_order_filed()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_url        text;
  v_key        text;
  v_contractor uuid;
  v_claimed_by uuid;
  v_job_title  text;
  v_recipient  uuid;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
  if v_url is null or v_key is null then return new; end if;

  select contractor_id, claimed_by, title
    into v_contractor, v_claimed_by, v_job_title
  from jobs where id = new.job_id;

  -- Notify whoever did NOT initiate the change order
  if new.initiated_by = v_contractor then
    v_recipient := v_claimed_by;
  else
    v_recipient := v_contractor;
  end if;

  if v_recipient is null then return new; end if;

  perform extensions.net.http_post(
    url     := v_url || '/functions/v1/send-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object(
      'userId', v_recipient,
      'title',  'Change Order Filed',
      'body',   'Review the change for "' || coalesce(v_job_title, 'your job') || '"',
      'data',   jsonb_build_object('type', 'change_order', 'jobId', new.job_id)
    )
  );

  return new;
end;
$$;

drop trigger if exists on_change_order_insert on change_orders;
create trigger on_change_order_insert
  after insert on change_orders
  for each row execute function public.notify_on_change_order_filed();


-- ── 3. Change order approved (UPDATE → status = 'approved') ─────────────────
create or replace function public.notify_on_change_order_approved()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_url        text;
  v_key        text;
  v_contractor uuid;
  v_claimed_by uuid;
  v_job_title  text;
begin
  if new.status != 'approved' or old.status = 'approved' then return new; end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
  if v_url is null or v_key is null then return new; end if;

  select contractor_id, claimed_by, title
    into v_contractor, v_claimed_by, v_job_title
  from jobs where id = new.job_id;

  -- Notify contractor
  if v_contractor is not null then
    perform extensions.net.http_post(
      url     := v_url || '/functions/v1/send-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body    := jsonb_build_object(
        'userId', v_contractor,
        'title',  'Change Order Approved',
        'body',   'Both parties approved the change for "' || coalesce(v_job_title, 'your job') || '"',
        'data',   jsonb_build_object('type', 'change_order_approved', 'jobId', new.job_id)
      )
    );
  end if;

  -- Notify sub
  if v_claimed_by is not null then
    perform extensions.net.http_post(
      url     := v_url || '/functions/v1/send-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body    := jsonb_build_object(
        'userId', v_claimed_by,
        'title',  'Change Order Approved',
        'body',   'Both parties approved the change for "' || coalesce(v_job_title, 'your job') || '"',
        'data',   jsonb_build_object('type', 'change_order_approved', 'jobId', new.job_id)
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_change_order_approved on change_orders;
create trigger on_change_order_approved
  after update on change_orders
  for each row execute function public.notify_on_change_order_approved();


-- ── 4. Job invite (INSERT) — notify the sub ─────────────────────────────────
-- job_invites.contractor_id → contractor_profiles(id), NOT auth.users.id
-- job_invites.sub_id        → sub_profiles(id),        NOT auth.users.id
-- Must join to get auth user IDs.
create or replace function public.notify_on_job_invite()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_url            text;
  v_key            text;
  v_sub_user_id    uuid;
  v_biz_name       text;
  v_job_title      text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
  if v_url is null or v_key is null then return new; end if;

  -- sub_id is sub_profiles.id; resolve to auth user_id
  select user_id into v_sub_user_id from sub_profiles where id = new.sub_id;
  if v_sub_user_id is null then return new; end if;

  -- contractor business name for the notification
  select cp.business_name into v_biz_name
    from contractor_profiles cp where cp.id = new.contractor_id;

  -- job title
  select title into v_job_title from jobs where id = new.job_id;

  perform extensions.net.http_post(
    url     := v_url || '/functions/v1/send-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object(
      'userId', v_sub_user_id,
      'title',  '📨 Job Invitation',
      'body',   coalesce(v_biz_name, 'A contractor') || ' invited you to "' || coalesce(v_job_title, 'a new job') || '"',
      'data',   jsonb_build_object('type', 'job_invite', 'jobId', new.job_id)
    )
  );

  return new;
end;
$$;

drop trigger if exists on_job_invite_insert on job_invites;
create trigger on_job_invite_insert
  after insert on job_invites
  for each row execute function public.notify_on_job_invite();


-- ── 5. Dispute opened (INSERT) — notify the other party ─────────────────────
create or replace function public.notify_on_dispute_opened()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_url        text;
  v_key        text;
  v_contractor uuid;
  v_claimed_by uuid;
  v_job_title  text;
  v_recipient  uuid;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
  if v_url is null or v_key is null then return new; end if;

  select contractor_id, claimed_by, title
    into v_contractor, v_claimed_by, v_job_title
  from jobs where id = new.job_id;

  -- Notify whoever did NOT open the dispute
  if new.opened_by = v_contractor then
    v_recipient := v_claimed_by;
  else
    v_recipient := v_contractor;
  end if;

  if v_recipient is null then return new; end if;

  perform extensions.net.http_post(
    url     := v_url || '/functions/v1/send-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object(
      'userId', v_recipient,
      'title',  '⚠️ Dispute Opened',
      'body',   'A dispute was opened on "' || coalesce(v_job_title, 'your job') || '"',
      'data',   jsonb_build_object('type', 'dispute', 'jobId', new.job_id)
    )
  );

  return new;
end;
$$;

drop trigger if exists on_dispute_insert on disputes;
create trigger on_dispute_insert
  after insert on disputes
  for each row execute function public.notify_on_dispute_opened();
