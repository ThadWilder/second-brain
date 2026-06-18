// Persistent Saved Jobs (the double-tap "like" shortlist). Backed by the
// saved_jobs table (migration 021) so a sub's list survives across sessions
// and devices. Saving is private and creates no obligation.

import { supabase } from './supabase';
import type { Job } from './types';

// All job_ids the signed-in sub has saved.
export async function getSavedJobIds(): Promise<Set<string>> {
  const { data } = await supabase.from('saved_jobs').select('job_id');
  return new Set((data ?? []).map((r: any) => r.job_id));
}

// Full saved jobs, hydrated with contractor + live status so the UI can show
// "claimed by someone else" instead of a dead link.
export async function getSavedJobs(): Promise<Job[]> {
  const { data } = await supabase
    .from('saved_jobs')
    .select('job:jobs(*, contractor:contractor_profiles(business_name, rating, rating_count))')
    .order('created_at', { ascending: false });
  return (data ?? []).map((r: any) => r.job).filter(Boolean) as Job[];
}

export async function saveJob(jobId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('saved_jobs').upsert(
    { sub_id: user.id, job_id: jobId },
    { onConflict: 'sub_id,job_id' },
  );
}

export async function unsaveJob(jobId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('saved_jobs').delete().eq('sub_id', user.id).eq('job_id', jobId);
}
