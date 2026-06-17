// Shared reputation logic: Job Success Score, tier badges, and profile
// completion. Pure functions — used by UI for display and by the
// compute-job-success edge function for scoring. Keep the two in sync.

export type Tier = 'new' | 'rising' | 'top_rated' | 'elite';

export interface TierMeta {
  key: Tier;
  label: string;
  emoji: string;
  color: string;
}

export const TIERS: Record<Tier, TierMeta> = {
  new:       { key: 'new',       label: 'New',         emoji: '🌱', color: '#94a3b8' },
  rising:    { key: 'rising',    label: 'Rising Talent', emoji: '📈', color: '#3b82f6' },
  top_rated: { key: 'top_rated', label: 'Top Rated',   emoji: '⭐', color: '#d4943a' },
  elite:     { key: 'elite',     label: 'Elite',       emoji: '💎', color: '#8b5cf6' },
};

export function tierMeta(tier: string | null | undefined): TierMeta {
  return TIERS[(tier as Tier)] ?? TIERS.new;
}

// Derive tier from score + completed jobs. Mirrors compute-job-success.
export function deriveTier(score: number | null, jobsCompleted: number): Tier {
  if (jobsCompleted === 0 || score === null) return 'new';
  if (score >= 90 && jobsCompleted >= 20) return 'elite';
  if (score >= 80 && jobsCompleted >= 10) return 'top_rated';
  return 'rising';
}

// Composite Job Success Score (0-100). Returns null until there's enough data
// (at least 3 completed jobs). Weighted: rating 50%, rehire 20%,
// dispute-free 20%, response 10%.
export function computeJobSuccessScore(input: {
  avgRating: number;          // 0-5
  ratingCount: number;
  rehireRate: number;         // 0-1
  jobsCompleted: number;
  disputeCount: number;
  responseRate: number | null; // 0-100
}): number | null {
  if (input.jobsCompleted < 3) return null;

  const ratingComponent = (input.avgRating / 5) * 100 * 0.5;
  const rehireComponent = input.rehireRate * 100 * 0.2;
  const disputeFree = Math.max(0, 1 - input.disputeCount / input.jobsCompleted);
  const disputeComponent = disputeFree * 100 * 0.2;
  const responseComponent = (input.responseRate ?? 80) * 0.1;

  return Math.round(ratingComponent + rehireComponent + disputeComponent + responseComponent);
}

export function scoreColor(score: number | null): string {
  if (score === null) return '#94a3b8';
  if (score >= 90) return '#16a34a';
  if (score >= 75) return '#22c55e';
  if (score >= 60) return '#d4943a';
  return '#ef4444';
}

// Profile completion: which fields are filled, as a 0-100 percentage plus the
// list of what's still missing (for the prompt).
export interface ProfileCompletion {
  percent: number;
  missing: string[];
}

export function profileCompletion(profile: any): ProfileCompletion {
  const checks: { label: string; done: boolean }[] = [
    { label: 'Add a bio',            done: !!profile?.bio?.trim() },
    { label: 'Add your skills',      done: (profile?.skills?.length ?? 0) > 0 },
    { label: 'Add a phone number',   done: !!profile?.phone_number },
    { label: 'Set your service area', done: !!profile?.service_area_zip },
    { label: 'Add license number',   done: !!profile?.license_number },
    { label: 'Add insurance info',   done: !!profile?.insurance_number },
    { label: 'Connect a payout account', done: !!profile?.stripe_account_id },
    { label: 'Get verified',         done: !!profile?.verified },
  ];
  const done = checks.filter(c => c.done).length;
  return {
    percent: Math.round((done / checks.length) * 100),
    missing: checks.filter(c => !c.done).map(c => c.label),
  };
}
