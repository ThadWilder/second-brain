-- Server-side push: when a message is inserted, notify the OTHER party on the
-- job by calling the send-notification edge function. Fires regardless of
-- whether the sender's app stays open, so delivery no longer depends on the
-- client. Secrets (project URL + service role key) live in Supabase Vault so
-- they are never committed to git.
create extension if not exists pg_net with schema extensions;

create or replace function public.notify_on_message()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_contractor uuid;
  v_claimed_by uuid;
  v_title      text;
  v_recipient  uuid;
  v_sender     text;
  v_url        text;
  v_key        text;
begin
  select contractor_id, claimed_by, title
    into v_contractor, v_claimed_by, v_title
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

  -- sender display name for the notification title
  if new.sender_role = 'contractor' then
    select business_name into v_sender from contractor_profiles where user_id = new.sender_id;
  else
    select name into v_sender from sub_profiles where user_id = new.sender_id;
  end if;

  -- config from Vault; bail quietly if not set up yet
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
  if v_url is null or v_key is null then
    return new;
  end if;

  perform net.http_post(
    url := v_url || '/functions/v1/send-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'userId', v_recipient,
      'title', 'Message from ' || coalesce(v_sender, 'SubHub'),
      'body', coalesce(v_title, 'New message'),
      'data', jsonb_build_object('type', 'message', 'jobId', new.job_id)
    )
  );

  return new;
end;
$$;

drop trigger if exists on_message_insert on messages;
create trigger on_message_insert
  after insert on messages
  for each row execute function public.notify_on_message();
