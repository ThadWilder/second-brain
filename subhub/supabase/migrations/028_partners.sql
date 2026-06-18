-- 028_partners.sql
-- Verified partner marketplace (blueprint §10) — the Phase-2 monetization
-- foundation. A small, CURATED set of named partners per category (one
-- accounting, one financing, one insurance, one payments…), shown as clearly
-- labeled "Recommended Tools" on SECONDARY surfaces only.
--
-- Non-negotiable constraint (enforced by where the UI renders it, not here):
-- no sponsored placement inside the core mobile workflow — posting a job,
-- browsing the board, claiming, messaging, or closing out. Dashboard / profile
-- / desktop only.
--
-- This is Category A (selling access to the audience): the platform never
-- exports user data. Partners only get placement.

create table if not exists sponsored_partners (
  id          uuid primary key default gen_random_uuid(),
  category    text not null check (category in
                ('accounting','financing','insurance','payments','materials','tools')),
  name        text not null,
  blurb       text not null,
  cta_label   text not null default 'Learn more',
  url         text not null,
  audience    text not null default 'both' check (audience in ('contractor','subcontractor','both')),
  weight      int  not null default 0,     -- ordering within a category
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists sponsored_partners_active_idx
  on sponsored_partners(active, category, weight);

alter table sponsored_partners enable row level security;

-- Everyone can read active partners (it's placement, not personal data).
drop policy if exists "partners_public_read" on sponsored_partners;
create policy "partners_public_read" on sponsored_partners
  for select using (active);

-- Curated active partners for an audience, optionally filtered by category,
-- highest weight first.
create or replace function recommended_partners(p_audience text default 'both', p_category text default null)
returns setof sponsored_partners
language sql stable security definer set search_path = public as $$
  select * from sponsored_partners
  where active
    and (audience = 'both' or audience = p_audience)
    and (p_category is null or category = p_category)
  order by weight desc, created_at desc;
$$;

-- Seed a few clearly-labeled example partners so the panel renders pre-launch.
-- Replace with real, contracted partners before charging for placement.
insert into sponsored_partners (category, name, blurb, cta_label, url, audience, weight)
select * from (values
  ('accounting','QuickBooks for Contractors','Sync jobs and payouts to your books automatically.','Connect','https://quickbooks.intuit.com','both',30),
  ('financing','BlueVine Capital','Working-capital lines for growing trade businesses.','See rates','https://www.bluevine.com','contractor',20),
  ('insurance','NEXT Insurance','General liability + tools coverage built for trades.','Get a quote','https://www.nextinsurance.com','both',20),
  ('payments','Branch Instant Pay','Faster payouts to a free digital wallet.','Learn more','https://www.branchapp.com','subcontractor',15)
) as v(category,name,blurb,cta_label,url,audience,weight)
where not exists (select 1 from sponsored_partners);
