// Fee waiver (migration 023). New users on both sides get a fixed number of
// fee-free jobs (counted in jobs, not calendar time). This module exposes the
// remaining waiver count for display; the actual fee is applied server-side at
// post / payout time by decrementing the counters.

import { supabase } from './supabase';

export const PLATFORM_FEE_PCT = 0.10; // sub-side payout fee once waivers used

export interface FeeStatus {
  role: 'contractor' | 'subcontractor';
  freeRemaining: number;
}

// Remaining fee-waived jobs for the signed-in user (null if no profile yet).
export async function getMyFeeStatus(): Promise<FeeStatus | null> {
  const { data } = await supabase.rpc('my_fee_status');
  const row = (data ?? [])[0];
  if (!row) return null;
  return { role: row.role, freeRemaining: row.free_remaining };
}

// Copy for the waiver banner.
export function feeWaiverMessage(s: FeeStatus): string {
  if (s.freeRemaining <= 0) {
    return s.role === 'contractor'
      ? 'Standard platform fee applies to new jobs.'
      : `Standard ${Math.round(PLATFORM_FEE_PCT * 100)}% payout fee applies.`;
  }
  const noun = s.role === 'contractor' ? 'post' : 'payout';
  return `🎉 ${s.freeRemaining} fee-free ${noun}${s.freeRemaining === 1 ? '' : 's'} left — no platform fee until you've used them.`;
}

// ── Loyalty volume discount (Tier-0, migration 029) ──
// A contractor↔sub pair earns a decreasing platform fee as they complete more
// jobs together. Rates are authoritative server-side (pair_fee_rate); these
// helpers only read + format for display.

export interface PairDiscount {
  jobsTogether: number;
  currentRate: number;       // e.g. 0.08
  nextRate: number | null;   // null once at the 5% floor
  jobsToNext: number | null; // jobs remaining to unlock nextRate
}

export interface ContractorPairDiscount extends PairDiscount {
  contractorId: string;
  businessName: string;
}

// Loyalty status for the signed-in sub with one specific contractor.
export async function getPairDiscount(contractorId: string): Promise<PairDiscount | null> {
  const { data } = await supabase.rpc('pair_discount_status', { p_contractor: contractorId });
  const row = (data ?? [])[0];
  if (!row) return null;
  return {
    jobsTogether: row.jobs_together ?? 0,
    currentRate: row.current_rate ?? PLATFORM_FEE_PCT,
    nextRate: row.next_rate ?? null,
    jobsToNext: row.jobs_to_next ?? null,
  };
}

// Every contractor the signed-in sub has a loyalty discount with.
export async function getMyPairDiscounts(): Promise<ContractorPairDiscount[]> {
  const { data } = await supabase.rpc('my_pair_discounts');
  return ((data ?? []) as any[]).map(r => ({
    contractorId: r.contractor_id,
    businessName: r.business_name,
    jobsTogether: r.jobs_together ?? 0,
    currentRate: r.current_rate ?? PLATFORM_FEE_PCT,
    nextRate: r.next_rate ?? null,
    jobsToNext: r.jobs_to_next ?? null,
  }));
}

export function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

// One-line nudge: how close the pair is to the next discount tier.
export function pairDiscountMessage(d: PairDiscount): string {
  if (d.nextRate === null || d.jobsToNext === null) {
    return `Loyalty floor reached — lowest ${pct(d.currentRate)} fee on every job together.`;
  }
  const jobs = d.jobsToNext;
  return `${jobs} more job${jobs === 1 ? '' : 's'} together drops your fee to ${pct(d.nextRate)}.`;
}
