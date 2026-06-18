// Backed By vouching (migration 024). A capped, reputation-costing peer
// endorsement of a user already on the platform — one person's opinion, never
// a platform certification. Server enforces the active-vouch cap.

import { supabase } from './supabase';
import type { Vouch } from './types';

export const VOUCH_CAP = 5;

// Who backs this user (for the "Backed By" row on their profile).
export async function getVouchesFor(userId: string): Promise<{ voucher_id: string; note?: string; created_at: string }[]> {
  const { data } = await supabase.rpc('vouches_for', { p_user: userId });
  return (data ?? []) as any[];
}

// Active vouches the signed-in user has extended (to enforce the cap in UI).
export async function getMyActiveVouches(): Promise<Vouch[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from('vouches')
    .select('*')
    .eq('voucher_id', user.id)
    .eq('active', true);
  return (data ?? []) as Vouch[];
}

export async function addVouch(voucheeId: string, note?: string): Promise<Vouch> {
  const { data, error } = await supabase.rpc('add_vouch', { p_vouchee: voucheeId, p_note: note ?? null });
  if (error) throw new Error(error.message);
  return data as Vouch;
}

export async function removeVouch(voucheeId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_vouch', { p_vouchee: voucheeId });
  if (error) throw new Error(error.message);
}
