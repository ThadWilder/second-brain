-- Job boost: contractors pay 1.5% of the total job (install_price) to push their
-- posting to the top of the sub job board with a highlighted "Boosted" badge.
-- The boosted flag is only ever set server-side by the boost-job edge function
-- after a successful charge, so the client can't fake a boost without paying.

alter table jobs add column if not exists boosted    boolean    not null default false;
alter table jobs add column if not exists boosted_at timestamptz;

-- Partial index so the board's "boosted first" ordering stays fast as jobs grow.
create index if not exists jobs_boosted_idx on jobs(boosted, created_at desc) where status = 'posted';
