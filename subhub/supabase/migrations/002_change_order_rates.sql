-- Pre-agreed change order rate schedule stored on contractor profile.
-- These rates are shown to subs at job claim time and auto-apply on change cards.
alter table contractor_profiles
  add column if not exists delay_pay_rate_per_hour numeric(10,2) not null default 35,
  add column if not exists addon_pay_rate_per_lf   numeric(10,2) not null default 15,
  add column if not exists return_trip_fee          numeric(10,2) not null default 150;
