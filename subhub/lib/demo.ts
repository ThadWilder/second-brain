// Demo / concept data — shown alongside real jobs so the marketplace, flip
// cards, job detail, and messaging can be experienced end-to-end before any
// real listings exist. Demo records use stable `demo-` ids; screens detect
// that prefix and serve this data locally instead of hitting Supabase.
//
// NOTE: nothing here writes to the database. Claiming/messaging a demo job is
// intentionally a no-op (a friendly alert) so the concept stays self-contained.

import type { Job, Message } from '@/lib/types';

export const DEMO_PREFIX = 'demo-';
export function isDemoId(id?: string | null): boolean {
  return !!id && id.startsWith(DEMO_PREFIX);
}

// A shared demo contractor profile (only the fields the UI reads).
const DEMO_CONTRACTOR = {
  business_name: 'Summit Fence Co.',
  rating: 4.8,
  rating_count: 37,
  delay_pay_rate_per_hour: 45,
  addon_pay_rate_per_lf: 18,
  return_trip_fee: 150,
  change_order_fee: 75,
  delay_liability_cap: 600,
  payment_terms_days: 10 as const,
};

const DEMO_CONTRACTOR_2 = {
  business_name: 'Ironclad Outdoor',
  rating: 4.9,
  rating_count: 52,
  delay_pay_rate_per_hour: 50,
  addon_pay_rate_per_lf: 20,
  return_trip_fee: 175,
  change_order_fee: 90,
  delay_liability_cap: 750,
  payment_terms_days: 14 as const,
};

const now = Date.now();
const hoursAgo = (h: number) => new Date(now - h * 3600_000).toISOString();
const daysFromNow = (d: number) =>
  new Date(now + d * 86400_000).toISOString().slice(0, 10);

export const DEMO_JOBS: Job[] = [
  {
    id: 'demo-1',
    contractor_id: 'demo-contractor-1',
    contractor: DEMO_CONTRACTOR as any,
    title: 'Cedar Privacy Fence — 180 LF Backyard Install',
    industry: 'Fencing',
    scope_of_work:
      'Install 180 linear feet of 6 ft cedar board-on-board privacy fence along the rear and one side property line. Includes 2 walk gates (4 ft) and one 10 ft double drive gate. Set all posts in concrete, 8 ft on center. Homeowner has marked the line and utilities are flagged (811 complete). Haul-off of one section of old chain-link (≈40 ft) included. Grade is mostly flat with a gentle slope on the south run.',
    materials: [],
    material_supplier: 'Summit Fence Co. Yard',
    material_supplier_address: '4120 Industrial Pkwy, Loaded & staged',
    material_status: 'on_site',
    address: '724 Birchwood Ln',
    city: 'Plano',
    state: 'TX',
    zip: '75024',
    estimated_days: 3,
    start_window_start: daysFromNow(2),
    start_window_end: daysFromNow(6),
    install_price: 8400,
    sub_payout: 4200,
    homeowner_name: 'Demo Homeowner',
    status: 'posted',
    created_at: hoursAgo(3),
    boosted: true,
    boosted_at: hoursAgo(3),
  },
  {
    id: 'demo-2',
    contractor_id: 'demo-contractor-1',
    contractor: DEMO_CONTRACTOR as any,
    title: 'Aluminum Pool Fence — Code-Compliant Safety Barrier',
    industry: 'Fencing',
    scope_of_work:
      'Install 140 LF of 4 ft black aluminum pool fencing with self-closing, self-latching gates to meet BOCA pool barrier code. Core-drill mounts into existing concrete pool deck on the west side; remaining runs are post-set in turf. Two gates required, both with magnetic key latches. Final layout must maintain 4 in max picket spacing. Inspection-ready photos required at closeout.',
    materials: [],
    material_supplier: 'Coastal Fence Supply',
    material_supplier_address: '2200 Marsh Rd — will-call (≈12 mi)',
    material_status: 'local',
    address: '15 Harborview Dr',
    city: 'Frisco',
    state: 'TX',
    zip: '75034',
    estimated_days: 2,
    start_window_start: daysFromNow(4),
    start_window_end: daysFromNow(10),
    install_price: 5600,
    sub_payout: 2800,
    homeowner_name: 'Demo Homeowner',
    status: 'posted',
    created_at: hoursAgo(11),
  },
  {
    id: 'demo-3',
    contractor_id: 'demo-contractor-2',
    contractor: DEMO_CONTRACTOR_2 as any,
    title: 'Composite Horizontal Fence + Steel Posts — Modern Build',
    industry: 'Fencing',
    scope_of_work:
      'Build 95 LF of 6 ft horizontal composite slat fence on powder-coated steel posts set in concrete. Posts are 6 ft on center; slats are pre-cut and labeled by run. This is a high-visibility front-yard feature fence — clean reveals and level top caps matter. One 5 ft pedestrian gate with soft-close hinge. Crew must keep saw cuts square; material overage is limited, so measure twice.',
    materials: [],
    material_supplier: 'Ironclad Outdoor Warehouse',
    material_supplier_address: 'Delivered to site morning of start',
    material_status: 'distant',
    address: '88 Maplewood Ct',
    city: 'McKinney',
    state: 'TX',
    zip: '75070',
    estimated_days: 4,
    start_window_start: daysFromNow(7),
    start_window_end: daysFromNow(14),
    install_price: 11200,
    sub_payout: 5600,
    homeowner_name: 'Demo Homeowner',
    status: 'posted',
    created_at: hoursAgo(26),
  },
  {
    id: 'demo-4',
    contractor_id: 'demo-contractor-2',
    contractor: DEMO_CONTRACTOR_2 as any,
    title: 'Chain-Link Repair & Re-Stretch — Commercial Lot',
    industry: 'Fencing',
    scope_of_work:
      'Repair and re-tension ≈220 LF of existing 8 ft galvanized chain-link around a commercial equipment yard. Replace 3 bent line posts, re-hang one 12 ft rolling cantilever gate that is off its track, and re-stretch fabric on the north and east runs. Tension bars and bands provided. Site is active during the day — work window is 7 AM–3 PM weekdays. Dump fee for damaged material is covered by contractor.',
    materials: [],
    material_supplier: 'On-site staging container',
    material_supplier_address: 'Materials staged in yard container',
    material_status: 'on_site',
    address: '3500 Commerce Blvd',
    city: 'Allen',
    state: 'TX',
    zip: '75002',
    estimated_days: 2,
    start_window_start: daysFromNow(3),
    start_window_end: daysFromNow(9),
    install_price: 3800,
    sub_payout: 1900,
    homeowner_name: 'Demo Site Manager',
    status: 'posted',
    created_at: hoursAgo(48),
  },
];

export function getDemoJob(id: string): Job | null {
  return DEMO_JOBS.find(j => j.id === id) ?? null;
}

// A demo conversation between the contractor and a sub on demo-1 so the
// messaging experience can be shown end-to-end. `sender_role` drives bubble
// alignment in the demo (sub = me, right side).
export const DEMO_MESSAGES: Record<string, Message[]> = {
  'demo-1': [
    {
      id: 'demo-msg-1',
      job_id: 'demo-1',
      sender_id: 'demo-sub',
      sender_role: 'subcontractor',
      body: "Hey — interested in the cedar privacy job. Are the posts already in or am I setting all of them from scratch?",
      created_at: hoursAgo(5),
    },
    {
      id: 'demo-msg-2',
      job_id: 'demo-1',
      sender_id: 'demo-contractor-1',
      sender_role: 'contractor',
      body: "Setting all from scratch. Material's loaded and staged at our yard, ready for pickup whenever you start. Concrete's included in the count.",
      created_at: hoursAgo(5),
    },
    {
      id: 'demo-msg-3',
      job_id: 'demo-1',
      sender_id: 'demo-sub',
      sender_role: 'subcontractor',
      body: "Perfect. The 10 ft double drive gate — standard drop rod + cane bolt setup?",
      created_at: hoursAgo(4),
    },
    {
      id: 'demo-msg-4',
      job_id: 'demo-1',
      sender_id: 'demo-contractor-1',
      sender_role: 'contractor',
      body: "Yep, drop rod and cane bolt, hardware's in the kit. Homeowner already flagged 811 so you're clear to dig. Can you start Thursday?",
      created_at: hoursAgo(4),
    },
    {
      id: 'demo-msg-5',
      job_id: 'demo-1',
      sender_id: 'demo-sub',
      sender_role: 'subcontractor',
      body: "Thursday works. I'll grab material Wednesday afternoon and be on site at 7. Claiming it now.",
      created_at: hoursAgo(2),
    },
  ],
};

export function getDemoMessages(jobId: string): Message[] {
  return DEMO_MESSAGES[jobId] ?? [];
}
