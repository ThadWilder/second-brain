-- Read receipts + unread badges. A message's read_at is stamped when the
-- recipient (the non-sender party) opens the thread. Null = unread.
alter table messages add column if not exists read_at timestamptz;

-- Fast unread lookups (recipient counts unread across their jobs).
create index if not exists messages_unread_idx on messages(job_id) where read_at is null;
