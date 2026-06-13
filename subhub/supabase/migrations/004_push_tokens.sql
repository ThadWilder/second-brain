-- Expo push tokens — one per user, updated on each app launch.
-- Stored in a single table keyed by user_id rather than in profiles
-- so a user can have multiple devices (future).
create table push_tokens (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  token      text not null,
  platform   text not null default 'unknown',
  updated_at timestamptz not null default now(),
  unique(user_id, token)
);

alter table push_tokens enable row level security;

create policy "push_tokens_own" on push_tokens
  for all using (auth.uid() = user_id);

-- Allow service role to read all tokens (for Edge Functions that send notifications)
create policy "push_tokens_service_read" on push_tokens
  for select using (true);

-- Notification log (for dedup / audit)
create table notification_log (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  type        text not null,
  job_id      uuid references jobs(id) on delete set null,
  sent_at     timestamptz not null default now()
);

alter table notification_log enable row level security;
create policy "notification_log_own" on notification_log
  for select using (auth.uid() = user_id);
