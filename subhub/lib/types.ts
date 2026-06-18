export type UserRole = 'contractor' | 'subcontractor' | 'admin';

export type JobStatus =
  | 'draft'
  | 'posted'
  | 'claimed'
  | 'in_progress'
  | 'pending_review'
  | 'complete'
  | 'disputed';

export type MaterialStatus = 'on_site' | 'local' | 'distant';

export type ChangeOrderType = 'layout' | 'material' | 'addon' | 'scope';

export interface ContractorProfile {
  id: string;
  user_id: string;
  business_name: string;
  license_number: string;
  insurance_number: string;
  insurance_expiry: string;
  scope_of_work: string[];
  service_area_miles: number;
  service_area_zip: string;
  contact_name: string;
  rating: number;
  rating_count: number;
  change_order_fee: number;
  delay_liability_cap: number;
  crew_slots?: number;
  subscription_tier?: 'starter' | 'pro' | 'crew_builder';
  free_posts_remaining?: number;
  referral_code?: string;
  payment_terms_days: 10 | 14;
  delay_pay_rate_per_hour: number;
  addon_pay_rate_per_lf: number;
  return_trip_fee: number;
  phone_number?: string;
  stripe_customer_id?: string;
  created_at: string;
}

export interface SubProfile {
  id: string;
  user_id: string;
  name: string;
  license_number: string;
  insurance_number: string;
  insurance_expiry: string;
  tax_id: string;
  skills: string[];
  service_area_miles: number;
  service_area_zip: string;
  phone_number?: string;
  payout_type: 'bank' | 'instant';
  stripe_account_id?: string;
  rating: number;
  rating_count: number;
  verified: boolean;
  bio?: string;
  jobs_completed?: number;
  availability?: 'available' | 'busy';
  job_success_score?: number | null;
  tier?: 'new' | 'rising' | 'top_rated' | 'elite';
  response_rate?: number | null;
  avg_response_minutes?: number | null;
  total_earned?: number;
  free_payouts_remaining?: number;
  referral_code?: string;
  diversification_score?: number | null;
  created_at: string;
}

export interface SavedSearch {
  id: string;
  sub_id: string;
  label?: string;
  skills: string[];
  zip?: string;
  radius_miles: number;
  min_payout?: number;
  notify: boolean;
  created_at: string;
}

export interface JobInvite {
  id: string;
  job_id: string;
  contractor_id: string;
  sub_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  message?: string;
  created_at: string;
}

export interface Dispute {
  id: string;
  job_id: string;
  opened_by: string;
  opener_role: 'contractor' | 'subcontractor';
  reason: string;
  status: 'open' | 'under_review' | 'resolved_paid' | 'resolved_cancelled' | 'resolved_split';
  resolution_note?: string;
  resolved_by?: string;
  resolved_at?: string;
  created_at: string;
}

export interface DisputeEvidence {
  id: string;
  dispute_id: string;
  submitted_by: string;
  submitter_role: 'contractor' | 'subcontractor' | 'admin';
  note?: string;
  photo_urls: string[];
  created_at: string;
}

export interface Job {
  id: string;
  contractor_id: string;
  contractor?: ContractorProfile;

  title: string;
  industry: string;
  scope_of_work: string;
  materials: JobMaterial[];
  material_supplier: string;
  material_supplier_address: string;
  material_status: MaterialStatus;
  site_layout_url?: string;

  address: string;
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;
  estimated_days: number;
  start_window_start: string;
  start_window_end: string;
  install_price: number;
  sub_payout: number;

  homeowner_name: string;

  status: JobStatus;
  claimed_by?: string;
  claimed_sub?: SubProfile;
  claimed_at?: string;
  completed_at?: string;
  created_at: string;

  boosted?: boolean;
  boosted_at?: string;

  // Crew priority window — only the contractor's active crew can see/claim
  // this job until the timestamp passes, then it opens to the whole board.
  crew_priority_until?: string;
  // Crew-aware overflow window — after the crew window, other contractors'
  // highly-rated crew in the same trade get a shot before the general board.
  overflow_until?: string;

  // Project coordination (jobs may belong to a parent Project).
  project_id?: string;
  sequence_order?: number;
  depends_on_job_id?: string;
}

export interface Project {
  id: string;
  contractor_id: string;
  title: string;
  customer_name?: string;
  description?: string;
  status: 'active' | 'on_hold' | 'complete' | 'cancelled';
  target_date?: string;
  created_at: string;
  // Hydrated client-side.
  jobs?: Job[];
  progress?: ProjectProgress;
}

export interface ProjectProgress {
  total_jobs: number;
  complete_jobs: number;
  active_jobs: number;
  posted_jobs: number;
  total_payout: number;
  earliest_start?: string;
  latest_start?: string;
}

export interface Referral {
  id: string;
  referrer_id: string;
  referrer_role: 'contractor' | 'subcontractor';
  referred_id: string;
  code_used?: string;
  status: 'pending' | 'completed';
  created_at: string;
  completed_at?: string;
}

export interface VisibilityBoost {
  id: string;
  user_id: string;
  kind: 'new_user' | 'referral' | 'referred' | 'premium';
  weight: number;
  expires_at: string;
  created_at: string;
}

export interface Vouch {
  id: string;
  voucher_id: string;
  vouchee_id: string;
  note?: string;
  active: boolean;
  created_at: string;
}

// "Build Your Crew" — a proven sub a contractor has added to their bench.
export interface CrewMember {
  id: string;
  contractor_id: string;
  sub_id: string;
  status: 'active' | 'at_risk' | 'removed';
  jobs_together: number;
  dollars_together: number;
  added_at: string;
  last_job_at?: string;
  created_at: string;
  sub?: SubProfile;
}

// A sub who has cleared the eligibility threshold but isn't on the crew yet.
export interface CrewCandidate {
  sub_id: string;
  jobs_together: number;
  dollars_together: number;
  last_job_at?: string;
  mutual_rating?: number;
  sub?: SubProfile;
}

export interface JobMaterial {
  id: string;
  job_id: string;
  name: string;
  quantity: number;
  unit: string;
  notes?: string;
}

export interface JobMedia {
  id: string;
  job_id: string;
  uploaded_by: string;
  phase: 'before' | 'during' | 'after';
  url: string;
  created_at: string;
}

export interface Message {
  id: string;
  job_id: string;
  sender_id: string;
  sender_role: UserRole;
  body: string;
  created_at: string;
}

export interface Rating {
  id: string;
  job_id: string;
  rater_id: string;
  ratee_id: string;
  stars: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  rehire: boolean;
  created_at: string;
}

export interface ChangeOrder {
  id: string;
  job_id: string;
  initiated_by: string;
  type: ChangeOrderType;
  material_status: MaterialStatus;
  description: string;
  delay_pay: number;
  addon_pay: number;
  return_trip_pay: number;
  total_adjustment: number;
  value_delta?: number;
  platform_markup?: number;
  contractor_approved: boolean;
  sub_approved: boolean;
  status: 'open' | 'approved' | 'disputed' | 'resolved';
  created_at: string;
}
