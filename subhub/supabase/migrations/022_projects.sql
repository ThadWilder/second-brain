-- 022_projects.sql
-- Projects: a parent container coordinating multiple Jobs for one customer
-- engagement that spans more than one trade or crew. Each Job stays
-- independently postable/claimable/payable; the Project is a coordination
-- layer only (one customer record, one timeline, sequencing across jobs).

create table if not exists projects (
  id            uuid primary key default gen_random_uuid(),
  contractor_id uuid references auth.users(id) on delete cascade not null,
  title         text not null,
  customer_name text,
  description   text,
  status        text not null default 'active'
                  check (status in ('active', 'on_hold', 'complete', 'cancelled')),
  target_date   date,
  created_at    timestamptz not null default now()
);

create index if not exists projects_contractor_idx on projects(contractor_id, status);

-- Link jobs to a project, with optional sequencing.
alter table jobs
  add column if not exists project_id        uuid references projects(id) on delete set null,
  add column if not exists sequence_order    int,
  add column if not exists depends_on_job_id uuid references jobs(id) on delete set null;

create index if not exists jobs_project_idx on jobs(project_id);

-- Progress rollup for a project: counts by job status + payout totals.
create or replace function project_progress(p_project uuid)
returns table(
  total_jobs     int,
  complete_jobs  int,
  active_jobs    int,
  posted_jobs    int,
  total_payout   numeric,
  earliest_start date,
  latest_start   date
)
language sql stable security definer set search_path = public as $$
  select
    count(*)::int,
    count(*) filter (where status = 'complete')::int,
    count(*) filter (where status in ('claimed','in_progress','pending_review'))::int,
    count(*) filter (where status = 'posted')::int,
    coalesce(sum(sub_payout), 0)::numeric,
    min(start_window_start::date),
    max(start_window_end::date)
  from jobs
  where project_id = p_project;
$$;

alter table projects enable row level security;

-- Contractor manages own projects.
create policy "projects_contractor" on projects
  for all using (auth.uid() = contractor_id) with check (auth.uid() = contractor_id);

-- A sub who can see a job in a project can read that project (for the
-- "part of a larger project" context on the job card). Read-only.
create policy "projects_sub_read" on projects
  for select using (
    exists (
      select 1 from jobs j
      where j.project_id = projects.id
        and (j.claimed_by = auth.uid() or j.status = 'posted')
    )
  );
