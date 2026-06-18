import { supabase } from './supabase';
import type { CrewMember, CrewCandidate, SubProfile } from './types';

// Eligibility thresholds — kept in sync with the SQL constants in
// migration 019 (add_to_crew / crew_candidates). Used for client-side
// copy only; the server is authoritative on whether an add succeeds.
export const CREW_MIN_JOBS = 3;
export const CREW_MIN_DOLLARS = 5000;

// How long a freshly posted job stays exclusive to the crew.
export const CREW_PRIORITY_HOURS = 24;

// Hydrate a list of sub user_ids into their profiles, keyed by user_id.
async function fetchSubProfiles(subIds: string[]): Promise<Record<string, SubProfile>> {
  if (subIds.length === 0) return {};
  const { data } = await supabase
    .from('sub_profiles')
    .select('*')
    .in('user_id', subIds);
  const map: Record<string, SubProfile> = {};
  (data ?? []).forEach((s: any) => { map[s.user_id] = s; });
  return map;
}

// The contractor's current crew (active + at-risk), newest first.
export async function getCrew(): Promise<CrewMember[]> {
  const { data, error } = await supabase
    .from('crew_members')
    .select('*')
    .neq('status', 'removed')
    .order('added_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as CrewMember[];
  const profiles = await fetchSubProfiles(rows.map(r => r.sub_id));
  return rows.map(r => ({ ...r, sub: profiles[r.sub_id] }));
}

// Subs who have cleared the threshold but aren't on the crew yet.
export async function getCrewCandidates(): Promise<CrewCandidate[]> {
  const { data, error } = await supabase.rpc('crew_candidates');
  if (error) throw error;
  const rows = (data ?? []) as CrewCandidate[];
  const profiles = await fetchSubProfiles(rows.map(r => r.sub_id));
  return rows.map(r => ({ ...r, sub: profiles[r.sub_id] }));
}

// Add a sub to the crew. Server validates eligibility + open slot; throws
// with a human-readable message if either check fails.
export async function addToCrew(subId: string): Promise<CrewMember> {
  const { data, error } = await supabase.rpc('add_to_crew', { p_sub: subId });
  if (error) throw new Error(error.message);
  return data as CrewMember;
}

export async function removeFromCrew(subId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_from_crew', { p_sub: subId });
  if (error) throw new Error(error.message);
}

// Slot usage for the signed-in contractor: { used, total }.
export async function getCrewSlots(): Promise<{ used: number; total: number }> {
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: profile }, { count }] = await Promise.all([
    supabase.from('contractor_profiles').select('crew_slots').eq('user_id', user!.id).single(),
    supabase.from('crew_members').select('id', { count: 'exact', head: true })
      .eq('contractor_id', user!.id).neq('status', 'removed'),
  ]);
  return { used: count ?? 0, total: profile?.crew_slots ?? 3 };
}
