// Referral links + earned visibility (migration 023). Every user has a
// personal code; sharing it pulls new users on and grants a time-limited
// visibility boost. Boosts always rank below Crew priority (Tier 1).

import { Platform, Share } from 'react-native';
import { supabase } from './supabase';
import type { Referral, VisibilityBoost } from './types';

const WEB_BASE = 'https://subhub.biz';

// The signed-in user's referral code (from whichever profile they have).
export async function getMyReferralCode(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: c }, { data: s }] = await Promise.all([
    supabase.from('contractor_profiles').select('referral_code').eq('user_id', user.id).maybeSingle(),
    supabase.from('sub_profiles').select('referral_code').eq('user_id', user.id).maybeSingle(),
  ]);
  return c?.referral_code ?? s?.referral_code ?? null;
}

export function referralLink(code: string): string {
  return `${WEB_BASE}/?ref=${encodeURIComponent(code)}`;
}

// Open the OS share sheet for a personal referral link.
export async function shareReferral(code: string): Promise<void> {
  const url = referralLink(code);
  const message = `Join me on SubHub — pre-sold jobs, material staged, paid through the app. ${url}`;
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).share) {
    try { await (navigator as any).share({ title: 'SubHub', text: message, url }); return; } catch { /* fall through */ }
  }
  await Share.share({ message, url });
}

// Share a specific job outside the platform. The recipient sees only enough
// to know it's real (trade, pay range, city) — the account gate reveals the
// rest after sign-up.
export async function shareJob(job: { id: string; industry: string; sub_payout: number; city: string; state: string }): Promise<void> {
  const code = (await getMyReferralCode()) ?? '';
  const url = `${WEB_BASE}/?job=${job.id}${code ? `&ref=${code}` : ''}`;
  const band = job.sub_payout >= 5000 ? '$5k+' : job.sub_payout >= 2500 ? '$2.5k–5k' : job.sub_payout >= 1000 ? '$1k–2.5k' : 'under $1k';
  const message = `${job.industry} job near ${job.city}, ${job.state} — ${band} payout, pre-sold and material staged. Claim it on SubHub: ${url}`;
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).share) {
    try { await (navigator as any).share({ title: 'SubHub job', text: message, url }); return; } catch { /* fall through */ }
  }
  await Share.share({ message, url });
}

// Record a referral at signup (no-op if the code is bad/self/absent).
export async function claimReferral(code: string): Promise<void> {
  if (!code) return;
  await supabase.rpc('claim_referral', { p_code: code });
}

export async function getMyReferrals(): Promise<Referral[]> {
  const { data } = await supabase
    .from('referrals')
    .select('*')
    .order('created_at', { ascending: false });
  return (data ?? []) as Referral[];
}

// Active visibility boosts for a user (used to show a badge / explain ranking).
export async function getActiveBoosts(userId: string): Promise<VisibilityBoost[]> {
  const { data } = await supabase
    .from('visibility_boosts')
    .select('*')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString());
  return (data ?? []) as VisibilityBoost[];
}
