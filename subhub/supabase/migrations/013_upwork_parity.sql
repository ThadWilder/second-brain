-- Upwork-parity features: reputation, availability, invites, saved searches,
-- structured disputes, and earnings support.

-- ── Sub reputation + availability ──────────────────────────────────────────
alter table sub_profiles
  add column if not exists availability         text    not null default 'available', -- available | busy
  add column if not exists job_success_score    integer,            -- 0-100, null until enough data
  add column if not exists tier                 text    not null default 'new',        -- new | rising | top_rated | elite
  add column if not exists response_rate        integer,            -- 0-100 percent of threads replied to
  add column if not exists avg_response_minutes  integer,            -- avg first-reply latency
  add column if not exists total_earned         numeric(12,2) not null default 0;

-- ── Saved searches (job alerts) ────────────────────────────────────────────
create table if not exists saved_searches (
  id            uuid primary key default gen_random_uuid(),
  sub_id        uuid references sub_profiles(id) on delete cascade not null,
  label         text,
  skills        text[]  default '{}',
  zip           text,
  radius_miles  integer default 75,
  min_payout    numeric(10,2),
  notify        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ── Job invites (contractor → sub) ─────────────────────────────────────────
create table if not exists job_invites (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid references jobs(id) on delete cascade not null,
  contractor_id uuid references contractor_profiles(id) on delete cascade not null,
  sub_id        uuid references sub_profiles(id) on delete cascade not null,
  status        text not null default 'pending', -- pending | accepted | declined | expired
  message       text,
  created_at    timestamptz not null default now(),
  unique(job_id, sub_id)
);

-- ── Structured disputes ────────────────────────────────────────────────────
create table if not exists disputes (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid references jobs(id) on delete cascade not null,
  opened_by       uuid references auth.users(id) not null,
  opener_role     text not null,                 -- contractor | subcontractor
  reason          text not null,
  status          text not null default 'open',  -- open | under_review | resolved_paid | resolved_cancelled | resolved_split
  resolution_note text,
  resolved_by     uuid references auth.users(id),
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists dispute_evidence (
  id             uuid primary key default gen_random_uuid(),
  dispute_id     uuid references disputes(id) on delete cascade not null,
  submitted_by   uuid references auth.users(id) not null,
  submitter_role text not null,                  -- contractor | subcontractor | admin
  note           text,
  photo_urls     text[] default '{}',
  created_at     timestamptz not null default now()
);

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table saved_searches   enable row level security;
alter table job_invites      enable row level security;
alter table disputes         enable row level security;
alter table dispute_evidence enable row level security;

-- Saved searches: owned by the sub
create policy "Saved search owner" on saved_searches for all using (
  sub_id in (select id from sub_profiles where user_id = auth.uid())
);

-- Job invites: contractor who sent, or the invited sub, can read; contractor manages
create policy "Invite parties read" on job_invites for select using (
  contractor_id in (select id from contractor_profiles where user_id = auth.uid())
  or sub_id in (select id from sub_profiles where user_id = auth.uid())
);
create policy "Contractor sends invite" on job_invites for insert with check (
  contractor_id in (select id from contractor_profiles where user_id = auth.uid())
);
create policy "Invite parties update" on job_invites for update using (
  contractor_id in (select id from contractor_profiles where user_id = auth.uid())
  or sub_id in (select id from sub_profiles where user_id = auth.uid())
);

-- Disputes: the two job parties + admin can read; either party can open
create policy "Dispute parties read" on disputes for select using (
  job_id in (select id from jobs where contractor_id in (select id from contractor_profiles where user_id = auth.uid()))
  or job_id in (select id from jobs where claimed_by = auth.uid())
  or (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);
create policy "Open dispute" on disputes for insert with check (opened_by = auth.uid());
create policy "Admin resolves dispute" on disputes for update using (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- Dispute evidence: visible to anyone who can see the parent dispute; submitters insert their own
create policy "Evidence read" on dispute_evidence for select using (
  dispute_id in (
    select id from disputes where
      job_id in (select id from jobs where contractor_id in (select id from contractor_profiles where user_id = auth.uid()))
      or job_id in (select id from jobs where claimed_by = auth.uid())
  )
  or (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);
create policy "Submit evidence" on dispute_evidence for insert with check (submitted_by = auth.uid());

-- ── Indexes ────────────────────────────────────────────────────────────────
create index if not exists idx_job_invites_sub      on job_invites(sub_id, status);
create index if not exists idx_saved_searches_sub   on saved_searches(sub_id);
create index if not exists idx_disputes_job          on disputes(job_id);
create index if not exists idx_disputes_status       on disputes(status);
create index if not exists idx_dispute_evidence_disp on dispute_evidence(dispute_id);
