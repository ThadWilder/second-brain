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
  contractor_approved: boolean;
  sub_approved: boolean;
  status: 'open' | 'approved' | 'disputed' | 'resolved';
  created_at: string;
}
