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
