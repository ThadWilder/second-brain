-- demo_data_completed.sql
-- Adds 3 completed + rated + paid jobs to the existing Maplewood Estates demo
-- project so the Earnings and Reviews screens have real data to show.
--
-- Run AFTER demo_data.sql in the Supabase SQL editor (service role → bypasses RLS).
-- The three jobs are spread across three different months so the monthly
-- earnings breakdown has multiple rows.
--
-- Cleanup: see the commented DELETE block at the bottom.

do $$
declare
  v_contractor   uuid;
  v_sub          uuid;
  v_project      uuid;
  v_job1         uuid;
  v_job2         uuid;
  v_job3         uuid;
begin
  -- ── Resolve the contractor (subhub_qa@gmail.com) ─────────────────────────
  select u.id into v_contractor
  from auth.users u
  where lower(u.email) = 'subhub_qa@gmail.com'
  limit 1;

  if v_contractor is null then
    raise exception 'User subhub_qa@gmail.com not found in auth.users.';
  end if;

  -- ── Resolve the sub (Stephen Dianosaur) ──────────────────────────────────
  select sp.user_id into v_sub
  from sub_profiles sp
  where sp.name ilike '%dianosaur%'
     or sp.name ilike '%stephen%'
  order by sp.created_at
  limit 1;

  if v_sub is null then
    raise exception 'Sub "Stephen Dianosaur" not found in sub_profiles. Run demo_data.sql first.';
  end if;

  -- ── Resolve the existing Maplewood project ────────────────────────────────
  select id into v_project
  from projects
  where contractor_id = v_contractor
    and title ilike '%Maplewood%'
  order by created_at
  limit 1;

  if v_project is null then
    raise exception 'Maplewood project not found — run demo_data.sql first.';
  end if;

  -- ── Completed job 1 (~3 months ago) ─────────────────────────────────────
  insert into jobs (
    contractor_id, project_id, title, industry, scope_of_work,
    material_supplier, material_supplier_address, material_status,
    address, city, state, zip,
    estimated_days, start_window_start, start_window_end,
    install_price, sub_payout, homeowner_name, status, sequence_order,
    claimed_by, claimed_at, completed_at
  ) values (
    v_contractor, v_project,
    'Cedar Board-on-Board Privacy Fence — Lot 2',
    'Fencing',
    '200 linear feet of 6ft cedar board-on-board fence with one 4ft walk gate. Material staged on site. Posts pre-drilled by prior crew.',
    'Eastgate Building Supply', '900 Industrial Blvd, Frisco, TX', 'on_site',
    '102 Maplewood Dr', 'Frisco', 'TX', '75034',
    2, '2026-03-10', '2026-03-12',
    7400, 3200, 'The Morrison Residence', 'complete', 5,
    v_sub, now() - interval '95 days', now() - interval '93 days'
  ) returning id into v_job1;

  -- ── Completed job 2 (~2 months ago) ─────────────────────────────────────
  insert into jobs (
    contractor_id, project_id, title, industry, scope_of_work,
    material_supplier, material_supplier_address, material_status,
    address, city, state, zip,
    estimated_days, start_window_start, start_window_end,
    install_price, sub_payout, homeowner_name, status, sequence_order,
    claimed_by, claimed_at, completed_at
  ) values (
    v_contractor, v_project,
    'Black Aluminum Pool Fence — Lot 5',
    'Fencing',
    '140 linear feet of 5ft black aluminum pool-code fence with two self-closing, self-latching gates. Inspection-ready finish required.',
    'Maple City Fence Wholesale', '1450 Commerce St, Plano, TX', 'on_site',
    '105 Maplewood Dr', 'Frisco', 'TX', '75034',
    2, '2026-04-07', '2026-04-09',
    9800, 4100, 'The Chen Residence', 'complete', 6,
    v_sub, now() - interval '62 days', now() - interval '60 days'
  ) returning id into v_job2;

  -- ── Completed job 3 (~1 month ago) ──────────────────────────────────────
  insert into jobs (
    contractor_id, project_id, title, industry, scope_of_work,
    material_supplier, material_supplier_address, material_status,
    address, city, state, zip,
    estimated_days, start_window_start, start_window_end,
    install_price, sub_payout, homeowner_name, status, sequence_order,
    claimed_by, claimed_at, completed_at
  ) values (
    v_contractor, v_project,
    'Split Rail Ranch Fence — Lot 19',
    'Fencing',
    '250 linear feet of 3-rail cedar split rail fence. Post holes pre-drilled. Material staged at front of property.',
    'Eastgate Building Supply', '900 Industrial Blvd, Frisco, TX', 'on_site',
    '119 Maplewood Dr', 'Frisco', 'TX', '75034',
    2, '2026-05-12', '2026-05-14',
    5600, 2800, 'The Santos Residence', 'complete', 7,
    v_sub, now() - interval '35 days', now() - interval '33 days'
  ) returning id into v_job3;

  -- ── Customer sign-offs ────────────────────────────────────────────────────
  insert into customer_signoffs (job_id, signed_by, confirmed_by, signed_at) values
    (v_job1, 'Mr. Morrison', v_sub, now() - interval '93 days'),
    (v_job2, 'Mrs. Chen',    v_sub, now() - interval '60 days'),
    (v_job3, 'Mrs. Santos',  v_sub, now() - interval '33 days');

  -- ── Payment records (released to sub) ────────────────────────────────────
  -- platform_fee_sub = 10% of sub_payout (base rate, no waiver for demo)
  -- paid_out_at is 3 days after completed_at (standard payment terms simulation)
  insert into payment_records (
    job_id, contractor_id, sub_id,
    install_price, sub_payout,
    platform_fee_contractor, platform_fee_sub,
    status, paid_out_at, created_at, updated_at
  ) values
    (v_job1, v_contractor, v_sub, 7400, 3200, 0, 320,  'released',
     now() - interval '90 days', now() - interval '93 days', now() - interval '90 days'),
    (v_job2, v_contractor, v_sub, 9800, 4100, 0, 410,  'released',
     now() - interval '57 days', now() - interval '60 days', now() - interval '57 days'),
    (v_job3, v_contractor, v_sub, 5600, 2800, 0, 280,  'released',
     now() - interval '30 days', now() - interval '33 days', now() - interval '30 days');

  -- ── Ratings: sub → contractor (powers the Reviews discovery screen) ───────
  -- The contractor_reviews() RPC selects ratings where ratee_id = contractor.
  insert into ratings (job_id, rater_id, ratee_id, stars, comment, rehire, tags) values
    (v_job1, v_sub, v_contractor, 5,
     'Best contractor I''ve worked for on this platform. Scope was crystal clear, material was on site exactly where they said, and payment released same day the review was approved.',
     true, '{clear_scope,on_time_payment,material_ready}'),
    (v_job2, v_sub, v_contractor, 5,
     'Material ready, homeowner already knew the plan, and the job card had everything I needed. No surprises. Will keep claiming their posts.',
     true, '{clear_scope,material_ready,professional}'),
    (v_job3, v_sub, v_contractor, 4,
     'Solid contractor — good communication throughout. One small layout change mid-job but they updated the scope card right away and it was no drama.',
     true, '{responsive,clear_scope}');

  -- ── Ratings: contractor → sub (updates sub star average via trigger) ──────
  insert into ratings (job_id, rater_id, ratee_id, stars, comment, rehire, tags) values
    (v_job1, v_contractor, v_sub, 5,
     'Stephen showed up on time, sent progress photos without being asked, and the homeowner loved the result. He''s on our crew list permanently.',
     true, '{on_time,quality_work,communicative}'),
    (v_job2, v_contractor, v_sub, 5,
     'Flawless — passed the pool-code inspection on the first visit. Fast, clean, zero issues.',
     true, '{quality_work,inspection_ready,efficient}'),
    (v_job3, v_contractor, v_sub, 4,
     'Great work as always. Small layout clarification was needed mid-job but Stephen handled it without any fuss.',
     true, '{quality_work,professional}');

  -- ── Bump sub total_earned (the trigger handles star averages) ─────────────
  update sub_profiles
     set total_earned = coalesce(total_earned, 0) + 3200 + 4100 + 2800
   where user_id = v_sub;

  raise notice 'Completed demo data created ✓ — jobs % % %, earnings: $10,100 released across 3 months',
    v_job1, v_job2, v_job3;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- CLEANUP: uncomment and run to wipe completed demo jobs before re-running.
-- ─────────────────────────────────────────────────────────────────────────────
-- delete from jobs
--   where project_id in (select id from projects where title ilike '%Maplewood%')
--     and status = 'complete'
--     and title in (
--       'Cedar Board-on-Board Privacy Fence — Lot 2',
--       'Black Aluminum Pool Fence — Lot 5',
--       'Split Rail Ranch Fence — Lot 19'
--     );
