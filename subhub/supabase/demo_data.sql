-- demo_data.sql
-- Seeds realistic demo data for screenshots / walkthroughs:
--   • 1 project owned by contractor "Stephen Dianosaur"
--   • 4 jobs (3 open/posted, 1 claimed + in progress by the QA sub)
--   • a natural message thread between Stephen and subhub_qa@gmail.com
--
-- Safe to run in the Supabase SQL editor (runs as service role → bypasses RLS).
-- Re-running it creates a fresh copy each time; to wipe a prior run first, see
-- the cleanup block at the very bottom (commented out).
--
-- Resolves both users dynamically:
--   contractor = contractor_profiles row whose name matches "Dianosaur"/"Stephen"
--   sub        = auth.users row with email subhub_qa@gmail.com

do $$
declare
  v_contractor   uuid;
  v_sub          uuid;
  v_project      uuid;
  v_job_posted1  uuid;
  v_job_posted2  uuid;
  v_job_posted3  uuid;
  v_job_claimed  uuid;
begin
  -- ── Resolve the contractor (Stephen Dianosaur) ───────────────────────────
  select cp.user_id into v_contractor
  from contractor_profiles cp
  where cp.contact_name  ilike '%dianosaur%'
     or cp.business_name ilike '%dianosaur%'
     or cp.contact_name  ilike '%stephen%'
  order by cp.created_at
  limit 1;

  if v_contractor is null then
    raise exception 'Contractor "Stephen Dianosaur" not found. Check contractor_profiles.contact_name / business_name.';
  end if;

  -- ── Resolve the QA sub (subhub_qa@gmail.com) ──────────────────────────────
  select u.id into v_sub
  from auth.users u
  where lower(u.email) = 'subhub_qa@gmail.com'
  limit 1;

  if v_sub is null then
    raise exception 'User subhub_qa@gmail.com not found in auth.users.';
  end if;

  -- Make sure the QA user actually has a sub profile (needed to claim jobs).
  if not exists (select 1 from sub_profiles where user_id = v_sub) then
    raise exception 'subhub_qa@gmail.com has no sub_profiles row — finish sub onboarding for that account first.';
  end if;

  -- ── 1) Project ────────────────────────────────────────────────────────────
  insert into projects (contractor_id, title, customer_name, description, status, target_date)
  values (
    v_contractor,
    'Maplewood Estates — Phase 1 Perimeter Fencing',
    'Maplewood HOA',
    'Multi-lot perimeter and amenity fencing across the new Maplewood Estates build-out. Coordinated install across several crews; jobs sequenced lot-by-lot.',
    'active',
    current_date + 45
  )
  returning id into v_project;

  -- ── 2) Jobs ─────────────────────────────────────────────────────────────-
  -- Posted job #1
  insert into jobs (
    contractor_id, project_id, title, industry, scope_of_work,
    material_supplier, material_supplier_address, material_status,
    address, city, state, zip,
    estimated_days, start_window_start, start_window_end,
    install_price, sub_payout, homeowner_name, status, sequence_order
  ) values (
    v_contractor, v_project,
    'Backyard Cedar Privacy Fence — Lot 14',
    'Fencing',
    '180 linear feet of 6ft cedar privacy fence, dog-ear pickets, 2 walk gates. Postholes pre-marked, utilities located. Haul-off of old fence included.',
    'Eastgate Building Supply', '900 Industrial Blvd, Frisco, TX', 'on_site',
    '142 Maplewood Dr', 'Frisco', 'TX', '75034',
    3, '2026-07-06', '2026-07-09',
    6200, 3400, 'The Patel Residence', 'posted', 1
  ) returning id into v_job_posted1;

  -- Posted job #2
  insert into jobs (
    contractor_id, project_id, title, industry, scope_of_work,
    material_supplier, material_supplier_address, material_status,
    address, city, state, zip,
    estimated_days, start_window_start, start_window_end,
    install_price, sub_payout, homeowner_name, status, sequence_order
  ) values (
    v_contractor, v_project,
    'Front Yard Aluminum Fence + Double Drive Gate — Lot 9',
    'Fencing',
    '120 linear feet of 4ft black aluminum ornamental fence plus a 12ft double drive gate. Material staged on site. Concrete footers required for gate posts.',
    'Maple City Fence Wholesale', '1450 Commerce St, Plano, TX', 'on_site',
    '109 Maplewood Dr', 'Frisco', 'TX', '75034',
    2, '2026-07-10', '2026-07-12',
    8800, 4900, 'The Okafor Residence', 'posted', 2
  ) returning id into v_job_posted2;

  -- Posted job #3
  insert into jobs (
    contractor_id, project_id, title, industry, scope_of_work,
    material_supplier, material_supplier_address, material_status,
    address, city, state, zip,
    estimated_days, start_window_start, start_window_end,
    install_price, sub_payout, homeowner_name, status, sequence_order
  ) values (
    v_contractor, v_project,
    'Side Yard Chain Link Removal & Replace — Lot 21',
    'Fencing',
    'Tear out 90ft of damaged 4ft chain link and replace with new galvanized chain link, top rail, and one 4ft gate. Pickup of materials at supplier required.',
    'Eastgate Building Supply', '900 Industrial Blvd, Frisco, TX', 'local',
    '121 Maplewood Dr', 'Frisco', 'TX', '75034',
    1, '2026-07-14', '2026-07-14',
    3100, 1650, 'The Nguyen Residence', 'posted', 3
  ) returning id into v_job_posted3;

  -- Claimed + in-progress job (claimed by the QA sub)
  insert into jobs (
    contractor_id, project_id, title, industry, scope_of_work,
    material_supplier, material_supplier_address, material_status,
    address, city, state, zip,
    estimated_days, start_window_start, start_window_end,
    install_price, sub_payout, homeowner_name, status, sequence_order,
    claimed_by, claimed_at
  ) values (
    v_contractor, v_project,
    'Pool Code-Compliance Safety Fence — Lot 7',
    'Fencing',
    '160 linear feet of 5ft black aluminum pool-code fence with self-closing, self-latching gates per local pool barrier code. Inspection-ready finish required.',
    'Maple City Fence Wholesale', '1450 Commerce St, Plano, TX', 'on_site',
    '107 Maplewood Dr', 'Frisco', 'TX', '75034',
    2, '2026-06-22', '2026-06-24',
    9400, 5200, 'The Reyes Residence', 'in_progress', 4,
    v_sub, now() - interval '2 days'
  ) returning id into v_job_claimed;

  -- ── 3) Message thread on the claimed job ──────────────────────────────────
  -- Older messages marked read; final contractor message left unread so the
  -- QA user sees an unread badge when they log in.
  insert into messages (job_id, sender_id, sender_role, body, created_at, read_at) values
    (v_job_claimed, v_contractor, 'contractor',
     'Hey — thanks for grabbing the pool fence on Lot 7. Material is staged in the garage, gates are in the boxes by the side door.',
     now() - interval '2 days' + interval '10 minutes', now() - interval '2 days' + interval '25 minutes'),
    (v_job_claimed, v_sub, 'subcontractor',
     'Got it. Confirming the gates are the self-closing/self-latching set for pool code? Want to make sure before I set the posts.',
     now() - interval '2 days' + interval '40 minutes', now() - interval '2 days' + interval '55 minutes'),
    (v_job_claimed, v_contractor, 'contractor',
     'Yes — both gates are the magna-latch self-closing units. Hinges are in the same box. Inspector wants the latch at 54in minimum.',
     now() - interval '2 days' + interval '1 hour', now() - interval '2 days' + interval '90 minutes'),
    (v_job_claimed, v_sub, 'subcontractor',
     'Perfect. Posts are set and concrete is curing. Should have the panels and gates hung by tomorrow afternoon.',
     now() - interval '1 day' + interval '3 hours', now() - interval '1 day' + interval '4 hours'),
    (v_job_claimed, v_contractor, 'contractor',
     'Looking great in the photos. Homeowner asked if we can shift the second gate about a foot toward the deck — okay on your end?',
     now() - interval '5 hours', now() - interval '4 hours'),
    (v_job_claimed, v_sub, 'subcontractor',
     'No problem, easy move before I pour the gate footers. Will send a photo once it''s framed up.',
     now() - interval '3 hours', now() - interval '2 hours'),
    -- Latest message: unread (read_at null) → shows a badge for the QA sub
    (v_job_claimed, v_contractor, 'contractor',
     'Appreciate it. Inspection is booked for Thursday AM, so anytime Wednesday to wrap up works great.',
     now() - interval '20 minutes', null);

  raise notice 'Demo data created: project %, jobs (% % % %), thread on %',
    v_project, v_job_posted1, v_job_posted2, v_job_posted3, v_job_claimed, v_job_claimed;
end $$;


-- ─────────────────────────────────────────────────────────────────────────--
-- CLEANUP (optional): uncomment and run to remove a prior demo seed before
-- re-seeding. Deletes the demo project, its jobs (cascade → messages), by title.
-- ─────────────────────────────────────────────────────────────────────────--
-- delete from jobs     where project_id in (select id from projects where title = 'Maplewood Estates — Phase 1 Perimeter Fencing');
-- delete from projects where title = 'Maplewood Estates — Phase 1 Perimeter Fencing';
