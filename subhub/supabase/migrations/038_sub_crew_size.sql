-- Sub onboarding: crew size. Idempotent — safe to re-run. No RLS changes
-- (sub_profiles RLS already exists in 001).

-- Crew size bucket captured at onboarding: 'solo','2-3','4-6','7+'.
alter table sub_profiles add column if not exists crew_size text not null default 'solo';

comment on column sub_profiles.crew_size is 'Sub crew size bucket: solo, 2-3, 4-6, or 7+.';
