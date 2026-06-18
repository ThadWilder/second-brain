-- 021_saved_jobs.sql
-- Persistent Saved Jobs (the "double-tap to like" shortlist from the
-- blueprint). A sub saves a posted job to a personal list; the save is
-- private, creates no obligation, and is resolved against live job status so
-- a job claimed by someone else shows as gone rather than a dead link.

create table if not exists saved_jobs (
  id         uuid primary key default gen_random_uuid(),
  sub_id     uuid references auth.users(id) on delete cascade not null,
  job_id     uuid references jobs(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  unique(sub_id, job_id)
);

create index if not exists saved_jobs_sub_idx on saved_jobs(sub_id);

alter table saved_jobs enable row level security;

-- A sub fully manages their own saved list; never visible to anyone else.
create policy "saved_jobs_owner" on saved_jobs
  for all using (auth.uid() = sub_id) with check (auth.uid() = sub_id);
