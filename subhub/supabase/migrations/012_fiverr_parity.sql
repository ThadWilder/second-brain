-- Bio and jobs completed on sub profiles
alter table sub_profiles add column if not exists bio text;
alter table sub_profiles add column if not exists jobs_completed integer default 0;

-- Portfolio photos
create table if not exists portfolio_photos (
  id uuid default gen_random_uuid() primary key,
  sub_id uuid references sub_profiles(id) on delete cascade,
  url text not null,
  caption text,
  created_at timestamptz default now()
);

-- Job view tracking
create table if not exists job_views (
  id uuid default gen_random_uuid() primary key,
  job_id uuid references jobs(id) on delete cascade,
  viewer_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- Pre-claim Q&A
create table if not exists job_questions (
  id uuid default gen_random_uuid() primary key,
  job_id uuid references jobs(id) on delete cascade,
  asker_id uuid references auth.users(id) on delete cascade,
  question text not null,
  answer text,
  answered_at timestamptz,
  created_at timestamptz default now()
);

-- Contractor favorites a sub
create table if not exists favorites (
  id uuid default gen_random_uuid() primary key,
  contractor_id uuid references contractor_profiles(id) on delete cascade,
  sub_id uuid references sub_profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique(contractor_id, sub_id)
);

-- RLS
alter table portfolio_photos enable row level security;
alter table job_views enable row level security;
alter table job_questions enable row level security;
alter table favorites enable row level security;

create policy "Portfolio owner" on portfolio_photos for all using (
  sub_id in (select id from sub_profiles where user_id = auth.uid())
);
create policy "Portfolio public read" on portfolio_photos for select using (true);

create policy "Insert job view" on job_views for insert with check (viewer_id = auth.uid());
create policy "Read job views" on job_views for select using (true);

create policy "Ask question" on job_questions for insert with check (asker_id = auth.uid());
create policy "Read questions" on job_questions for select using (true);
create policy "Contractor answers" on job_questions for update using (
  job_id in (select id from jobs where contractor_id in (select id from contractor_profiles where user_id = auth.uid()))
);

create policy "Contractor favorites" on favorites for all using (
  contractor_id in (select id from contractor_profiles where user_id = auth.uid())
);
