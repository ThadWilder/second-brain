-- Logs every Twilio-bridged call, linked to the job it belongs to.
create table if not exists call_log (
  id                uuid primary key default gen_random_uuid(),
  job_id            uuid references jobs(id) on delete cascade not null,
  initiated_by      uuid references auth.users(id) not null,
  initiated_by_role text not null check (initiated_by_role in ('contractor', 'subcontractor')),
  call_sid          text,
  status            text not null default 'initiated',
  created_at        timestamptz not null default now()
);

create index if not exists idx_call_log_job on call_log(job_id, created_at desc);

alter table call_log enable row level security;

-- The contractor or the claimed sub on the job can see the log
create policy "Call log job parties" on call_log for select using (
  job_id in (
    select id from jobs
    where contractor_id in (select id from contractor_profiles where user_id = auth.uid())
       or claimed_by = auth.uid()
  )
);

create policy "Call log insert own" on call_log for insert with check (
  initiated_by = auth.uid()
);
