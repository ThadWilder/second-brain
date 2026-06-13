-- Payment records table.
-- One payment record per completed job.
-- Stripe handles the actual charge; we track state here.
create type payment_status as enum (
  'pending',    -- job complete, payment not yet initiated
  'processing', -- payment intent created
  'held',       -- funds captured, not yet released to sub
  'released',   -- sub paid out
  'failed',     -- charge failed
  'disputed'    -- chargeback / dispute
);

create table payment_records (
  id                     uuid primary key default uuid_generate_v4(),
  job_id                 uuid references jobs(id) on delete cascade not null unique,
  contractor_id          uuid references auth.users(id) not null,
  sub_id                 uuid references auth.users(id) not null,

  -- amounts
  install_price          numeric(10,2) not null,
  sub_payout             numeric(10,2) not null,
  platform_fee_contractor numeric(10,2) not null default 0,
  platform_fee_sub       numeric(10,2) not null default 0,
  change_order_total     numeric(10,2) not null default 0,

  -- Stripe references
  stripe_payment_intent_id  text,
  stripe_transfer_id        text,
  stripe_sub_account_id     text,

  status                 payment_status not null default 'pending',
  paid_out_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table payment_records enable row level security;

create policy "payment_records_parties" on payment_records
  for all using (auth.uid() = contractor_id or auth.uid() = sub_id);

-- Customer sign-off table
create table customer_signoffs (
  id           uuid primary key default uuid_generate_v4(),
  job_id       uuid references jobs(id) on delete cascade not null unique,
  signed_by    text not null,   -- homeowner name (confirmed by sub)
  confirmed_by uuid references auth.users(id) not null,  -- sub user_id
  signed_at    timestamptz not null default now(),
  notes        text
);

alter table customer_signoffs enable row level security;

create policy "signoffs_parties" on customer_signoffs
  for all using (
    exists (
      select 1 from jobs j
      where j.id = job_id
      and (j.contractor_id = auth.uid() or j.claimed_by = auth.uid())
    )
  );
