-- 040_notifications_realtime.sql
-- Add the notifications table (migration 036) to the Realtime publication so the
-- in-app bell tray updates live as rows are inserted. This is the migration-file
-- equivalent of toggling the table on under Dashboard → Database → Replication,
-- so it ships with every `supabase db push` and never has to be done by hand.
--
-- Guarded so re-running is a no-op: `alter publication ... add table` errors if
-- the table is already a member, so we only add it when it isn't already there.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table notifications;
  end if;
end;
$$;
