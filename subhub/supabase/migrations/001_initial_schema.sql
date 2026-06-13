-- SubHub initial schema
-- Run against a fresh Supabase project

-- Enable extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- ============================================================
-- CONTRACTOR PROFILES
-- ============================================================
create table contractor_profiles (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid references auth.users(id) on delete cascade not null unique,
  business_name       text not null,
  contact_name        text not null,
  license_number      text not null,
  insurance_number    text not null,
  insurance_expiry    text not null,
  scope_of_work       text[] default '{}',
  service_area_zip    text not null,
  service_area_miles  int  not null default 50,
  rating              numeric(3,2) not null default 0,
  rating_count        int not null default 0,
  -- pre-agreed fee schedule (set at onboarding, non-negotiable on site)
  change_order_fee    numeric(10,2) not null default 75,
  delay_liability_cap numeric(10,2) not null default 500,
  payment_terms_days  int not null default 14 check (payment_terms_days in (10, 14)),
  stripe_customer_id  text,
  created_at          timestamptz not null default now()
);

-- ============================================================
-- SUB PROFILES
-- ============================================================
create table sub_profiles (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid references auth.users(id) on delete cascade not null unique,
  name                text not null,
  license_number      text not null,
  insurance_number    text not null,
  insurance_expiry    text not null,
  tax_id              text not null,
  skills              text[] default '{}',
  service_area_zip    text not null,
  service_area_miles  int  not null default 75,
  payout_type         text not null default 'bank' check (payout_type in ('bank', 'instant')),
  stripe_account_id   text,
  rating              numeric(3,2) not null default 0,
  rating_count        int not null default 0,
  verified            boolean not null default false,
  created_at          timestamptz not null default now()
);

-- ============================================================
-- JOBS
-- ============================================================
create type job_status as enum (
  'draft', 'posted', 'claimed', 'in_progress',
  'pending_review', 'complete', 'disputed'
);

create type material_status as enum ('on_site', 'local', 'distant');

create table jobs (
  id                        uuid primary key default uuid_generate_v4(),
  contractor_id             uuid references auth.users(id) on delete cascade not null,

  -- scope
  title                     text not null,
  industry                  text not null default 'Fencing',
  scope_of_work             text not null,
  material_supplier         text not null,
  material_supplier_address text not null default '',
  material_status           material_status not null default 'on_site',
  site_layout_url           text,

  -- logistics
  address                   text not null,
  city                      text not null,
  state                     text not null,
  zip                       text not null,
  lat                       numeric,
  lng                       numeric,
  estimated_days            int not null default 1,
  start_window_start        text not null default '',
  start_window_end          text not null default '',
  install_price             numeric(10,2) not null default 0,
  sub_payout                numeric(10,2) not null default 0,

  -- closeout
  homeowner_name            text not null,
  homeowner_phone           text not null default '',  -- never exposed to sub
  homeowner_email           text not null default '',  -- never exposed to sub

  status                    job_status not null default 'draft',
  claimed_by                uuid references auth.users(id),
  claimed_at                timestamptz,
  completed_at              timestamptz,
  created_at                timestamptz not null default now()
);

create index jobs_status_idx on jobs(status);
create index jobs_contractor_idx on jobs(contractor_id);
create index jobs_claimed_by_idx on jobs(claimed_by);
create index jobs_zip_idx on jobs(zip);

-- ============================================================
-- JOB MATERIALS
-- ============================================================
create table job_materials (
  id       uuid primary key default uuid_generate_v4(),
  job_id   uuid references jobs(id) on delete cascade not null,
  name     text not null,
  quantity numeric not null default 1,
  unit     text not null default 'each',
  notes    text
);

-- ============================================================
-- JOB MEDIA (photos)
-- ============================================================
create table job_media (
  id            uuid primary key default uuid_generate_v4(),
  job_id        uuid references jobs(id) on delete cascade not null,
  uploaded_by   uuid references auth.users(id) not null,
  phase         text not null check (phase in ('before', 'during', 'after')),
  url           text not null,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- MESSAGES (in-app only — VoIP handled by Twilio, not stored here)
-- ============================================================
create table messages (
  id          uuid primary key default uuid_generate_v4(),
  job_id      uuid references jobs(id) on delete cascade not null,
  sender_id   uuid references auth.users(id) not null,
  sender_role text not null check (sender_role in ('contractor', 'subcontractor')),
  body        text not null,
  created_at  timestamptz not null default now()
);

create index messages_job_idx on messages(job_id, created_at);

-- ============================================================
-- RATINGS
-- ============================================================
create table ratings (
  id         uuid primary key default uuid_generate_v4(),
  job_id     uuid references jobs(id) on delete cascade not null,
  rater_id   uuid references auth.users(id) not null,
  ratee_id   uuid references auth.users(id) not null,
  stars      int not null check (stars between 1 and 5),
  comment    text,
  rehire     boolean not null default false,
  created_at timestamptz not null default now(),
  unique(job_id, rater_id)
);

-- Recalculate aggregate rating after each insert
create or replace function update_ratings() returns trigger language plpgsql as $$
declare
  avg_stars numeric;
  cnt       int;
  ratee_role text;
begin
  select user_metadata->>'role' into ratee_role
  from auth.users where id = new.ratee_id;

  select avg(stars), count(*) into avg_stars, cnt
  from ratings where ratee_id = new.ratee_id;

  if ratee_role = 'contractor' then
    update contractor_profiles set rating = avg_stars, rating_count = cnt
    where user_id = new.ratee_id;
  elsif ratee_role = 'subcontractor' then
    update sub_profiles set rating = avg_stars, rating_count = cnt
    where user_id = new.ratee_id;
  end if;
  return new;
end;
$$;

create trigger trg_update_ratings
  after insert on ratings
  for each row execute function update_ratings();

-- ============================================================
-- CHANGE ORDERS
-- ============================================================
create type change_order_type as enum ('layout', 'material', 'addon', 'scope');
create type change_order_status as enum ('open', 'approved', 'disputed', 'resolved');

create table change_orders (
  id                   uuid primary key default uuid_generate_v4(),
  job_id               uuid references jobs(id) on delete cascade not null,
  initiated_by         uuid references auth.users(id) not null,
  type                 change_order_type not null,
  material_status      material_status not null default 'on_site',
  description          text not null,
  delay_pay            numeric(10,2) not null default 0,
  addon_pay            numeric(10,2) not null default 0,
  return_trip_pay      numeric(10,2) not null default 0,
  total_adjustment     numeric(10,2) generated always as (delay_pay + addon_pay + return_trip_pay) stored,
  contractor_approved  boolean not null default false,
  sub_approved         boolean not null default false,
  status               change_order_status not null default 'open',
  created_at           timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table contractor_profiles enable row level security;
alter table sub_profiles enable row level security;
alter table jobs enable row level security;
alter table job_materials enable row level security;
alter table job_media enable row level security;
alter table messages enable row level security;
alter table ratings enable row level security;
alter table change_orders enable row level security;

-- contractor_profiles: own row + subs can read (for job cards)
create policy "contractor_profiles_own" on contractor_profiles
  for all using (auth.uid() = user_id);
create policy "contractor_profiles_subs_read" on contractor_profiles
  for select using (true);

-- sub_profiles: own row + contractors can read (for claims)
create policy "sub_profiles_own" on sub_profiles
  for all using (auth.uid() = user_id);
create policy "sub_profiles_contractors_read" on sub_profiles
  for select using (true);

-- jobs: contractor sees own jobs, subs see posted + their claimed jobs
create policy "jobs_contractor_all" on jobs
  for all using (auth.uid() = contractor_id);
create policy "jobs_sub_read_posted" on jobs
  for select using (status = 'posted' or claimed_by = auth.uid());
create policy "jobs_sub_update_claim" on jobs
  for update using (status = 'posted' and claimed_by is null)
  with check (claimed_by = auth.uid());

-- job_materials: readable by job parties
create policy "job_materials_read" on job_materials
  for select using (
    exists (select 1 from jobs j where j.id = job_id and (j.contractor_id = auth.uid() or j.claimed_by = auth.uid() or j.status = 'posted'))
  );

-- job_media: job parties
create policy "job_media_parties" on job_media
  for all using (
    exists (select 1 from jobs j where j.id = job_id and (j.contractor_id = auth.uid() or j.claimed_by = auth.uid()))
  );

-- messages: job parties only
create policy "messages_parties" on messages
  for all using (
    exists (select 1 from jobs j where j.id = job_id and (j.contractor_id = auth.uid() or j.claimed_by = auth.uid()))
  );

-- ratings: own ratings + read others' on completed jobs
create policy "ratings_rater" on ratings
  for all using (rater_id = auth.uid());
create policy "ratings_read" on ratings
  for select using (true);

-- change orders: job parties
create policy "change_orders_parties" on change_orders
  for all using (
    exists (select 1 from jobs j where j.id = job_id and (j.contractor_id = auth.uid() or j.claimed_by = auth.uid()))
  );
