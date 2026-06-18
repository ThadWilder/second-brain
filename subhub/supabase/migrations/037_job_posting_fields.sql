-- Job posting flow: trade-specific measurement, site-access notes, start-window presets.
-- Idempotent — safe to re-run. No RLS changes (jobs RLS already exists in 001).

-- Gate/parking/pet/site-access notes, distinct from scope_of_work.
alter table jobs add column if not exists access_notes text not null default '';

-- Trade-specific measurement KIND, e.g. 'linear_feet','square_feet','fixture_count','units'.
alter table jobs add column if not exists trade_measure_type text;

-- Numeric quantity that pairs with trade_measure_type.
alter table jobs add column if not exists trade_measure_value numeric;

-- Start-window preset: one of 'asap','this_week','custom'.
alter table jobs add column if not exists start_window_type text not null default 'custom';
