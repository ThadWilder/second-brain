import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { notify } from '@/lib/notifications';
import { getMyFeeStatus, getPairDiscount, pairDiscountMessage, pct, type PairDiscount } from '@/lib/fees';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import type { Job } from '@/lib/types';

const PLATFORM_FEE_PCT = 0.10;

export default function ClaimConfirmScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [job, setJob] = useState<Job | null>(null);
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [confirmedAvailable, setConfirmedAvailable] = useState(false);
  const [feeWaived, setFeeWaived] = useState(false);
  const [pairDiscount, setPairDiscount] = useState<PairDiscount | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: j } = await supabase
        .from('jobs')
        .select('*, contractor:contractor_profiles(business_name, rating, rating_count)')
        .eq('id', id)
        .single();
      setJob(j);

      const [feeStatus, discount] = await Promise.all([
        getMyFeeStatus(),
        j?.contractor_id ? getPairDiscount(j.contractor_id) : Promise.resolve(null),
      ]);
      setFeeWaived((feeStatus?.freeRemaining ?? 0) > 0);
      setPairDiscount(discount);
      setLoading(false);
    }
    load();
  }, [id]);

  async function handleClaim() {
    if (!job || !userId) return;
    setClaiming(true);
    // Submit a claim REQUEST — the contractor reviews and accepts/declines.
    // The job only moves to 'claimed' once the contractor approves (server-side
    // via accept_claim). See migration 035.
    const { error } = await supabase.rpc('request_claim', { p_job: id });
    setClaiming(false);
    if (error) {
      Alert.alert('Could not request', error.message ?? 'This job may no longer be available.');
      return;
    }
    await notify.jobClaimed(job.contractor_id, job.title, 'A subcontractor');
    Alert.alert(
      'Claim Requested ✅',
      'The contractor has been notified to review your profile and accept. You\'ll get a notification as soon as they do.',
      [{ text: 'OK', onPress: () => router.replace({ pathname: '/(sub)/jobs/[id]', params: { id } } as any) }],
    );
  }

  if (loading) return <ActivityIndicator style={styles.loader} color={colors.accent} />;
  if (!job) return <Text style={styles.notFound}>Job not found.</Text>;

  const gross = Number(job.sub_payout ?? 0);
  const feeRate = pairDiscount?.currentRate ?? PLATFORM_FEE_PCT;
  const isDiscounted = !feeWaived && feeRate < PLATFORM_FEE_PCT;
  const fee = feeWaived ? 0 : Math.round(gross * feeRate * 100) / 100;
  const net = gross - fee;
  const canClaim = agreedTerms && confirmedAvailable;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Hero payout */}
      <View style={styles.hero}>
        <Text style={styles.netLabel}>You receive</Text>
        <Text style={styles.net}>{fmt(net)}</Text>
        {feeWaived && (
          <View style={styles.waiveBadge}>
            <Text style={styles.waiveBadgeText}>🎉 Fee waived — new-user bonus</Text>
          </View>
        )}
      </View>

      {/* Fee breakdown */}
      <View style={styles.breakdownCard}>
        <Text style={styles.breakdownTitle}>Payout Breakdown</Text>
        <Row label="Job payout" value={fmt(gross)} />
        <Row
          label={feeWaived
            ? 'Platform fee (waived)'
            : isDiscounted
              ? `Platform fee (${pct(feeRate)} — loyalty rate)`
              : `Platform fee (${pct(feeRate)})`}
          value={feeWaived ? '–$0.00' : `-${fmt(fee)}`}
          muted={feeWaived}
          strike={feeWaived}
        />
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Your take-home</Text>
          <Text style={styles.totalValue}>{fmt(net)}</Text>
        </View>
      </View>

      {/* Loyalty volume discount nudge */}
      {pairDiscount && !feeWaived && (
        <View style={[styles.loyaltyCard, isDiscounted && styles.loyaltyCardActive]}>
          <Text style={styles.loyaltyTitle}>
            {isDiscounted ? `🔥 Loyalty rate: ${pct(feeRate)} fee` : '🤝 Build a loyalty discount'}
          </Text>
          <Text style={styles.loyaltyText}>
            {pairDiscount.jobsTogether > 0
              ? `You've completed ${pairDiscount.jobsTogether} job${pairDiscount.jobsTogether === 1 ? '' : 's'} with ${(job.contractor as any)?.business_name ?? 'this contractor'}. `
              : ''}
            {pairDiscountMessage(pairDiscount)}
          </Text>
        </View>
      )}

      {/* Job summary */}
      <View style={styles.jobCard}>
        <Text style={styles.jobTitle}>{job.title}</Text>
        <Text style={styles.jobMeta}>
          📍 {job.city}, {job.state}  ·  {job.estimated_days} day{job.estimated_days !== 1 ? 's' : ''}
        </Text>
        {job.contractor && (
          <Text style={styles.jobContractor}>
            Posted by {(job.contractor as any).business_name}
          </Text>
        )}
        <View style={styles.windowRow}>
          <Text style={styles.windowLabel}>Start window</Text>
          <Text style={styles.windowValue}>{job.start_window_start} → {job.start_window_end}</Text>
        </View>
        <View style={styles.windowRow}>
          <Text style={styles.windowLabel}>Materials</Text>
          <Text style={styles.windowValue}>{materialStatus(job.material_status)}</Text>
        </View>
      </View>

      {/* Availability confirmation */}
      <TouchableOpacity
        style={styles.checkRow}
        onPress={() => setConfirmedAvailable(v => !v)}
        activeOpacity={0.85}
      >
        <Checkbox on={confirmedAvailable} />
        <Text style={styles.checkText}>
          I am available within the start window and can complete this job in {job.estimated_days} day{job.estimated_days !== 1 ? 's' : ''}.
        </Text>
      </TouchableOpacity>

      {/* Terms agreement */}
      <TouchableOpacity
        style={styles.checkRow}
        onPress={() => setAgreedTerms(v => !v)}
        activeOpacity={0.85}
      >
        <Checkbox on={agreedTerms} />
        <Text style={styles.checkText}>
          I agree to the job terms: complete the full scope of work, upload before and after photos,
          collect customer sign-off, and settle any change orders through SubHub before closeout.
          I understand SubHub will deduct {feeWaived ? '$0 (fee waived)' : `a ${pct(feeRate)} platform fee`} from my payout.
        </Text>
      </TouchableOpacity>

      {/* What happens next */}
      <View style={styles.nextSteps}>
        <Text style={styles.nextTitle}>What happens next</Text>
        <Step n="1" text="Contractor gets notified and can accept or decline within 2 hours." />
        <Step n="2" text="Once accepted you'll receive a push notification and the job appears in My Jobs." />
        <Step n="3" text="Start work within the agreed window. Upload photos to document progress." />
        <Step n="4" text="Get customer sign-off to trigger payment release." />
      </View>

      {/* Action buttons */}
      <TouchableOpacity
        style={[styles.claimBtn, !canClaim && styles.claimBtnDisabled]}
        onPress={handleClaim}
        disabled={claiming || !canClaim}
      >
        {claiming
          ? <ActivityIndicator color={colors.white} />
          : <Text style={styles.claimBtnText}>Agree & Request to Claim</Text>}
      </TouchableOpacity>

      {!canClaim && (
        <Text style={styles.hint}>Check both boxes above to continue.</Text>
      )}

      <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
        <Text style={styles.cancelBtnText}>← Go Back</Text>
      </TouchableOpacity>

      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

function Row({ label, value, muted, strike }: { label: string; value: string; muted?: boolean; strike?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, muted && styles.rowMuted]}>{label}</Text>
      <Text style={[styles.rowValue, muted && styles.rowMuted, strike && styles.rowStrike]}>{value}</Text>
    </View>
  );
}

function Checkbox({ on }: { on: boolean }) {
  return (
    <View style={[styles.checkbox, on && styles.checkboxOn]}>
      {on && <Text style={styles.checkmark}>✓</Text>}
    </View>
  );
}

function Step({ n, text }: { n: string; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepDot}><Text style={styles.stepN}>{n}</Text></View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

function materialStatus(s: Job['material_status']) {
  if (s === 'on_site') return '✅ On-site (ready to go)';
  if (s === 'local') return '📍 Local pickup (~25 mi)';
  return '🚚 Distant — delivery applies';
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  loader: { flex: 1, marginTop: spacing.xxl },
  notFound: { textAlign: 'center', marginTop: spacing.xxl, color: colors.textMuted },

  hero: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.xs },
  netLabel: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  net: { fontSize: 56, fontWeight: '900', color: colors.accent },
  waiveBadge: { backgroundColor: '#dcfce7', borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 4, marginTop: spacing.xs },
  waiveBadgeText: { fontSize: fontSize.xs, color: '#166534', fontWeight: '700' },

  breakdownCard: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm,
  },
  breakdownTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { fontSize: fontSize.sm, color: colors.text },
  rowValue: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600' },
  rowMuted: { color: colors.textMuted },
  rowStrike: { textDecorationLine: 'line-through' },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.xs,
  },
  totalLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  totalValue: { fontSize: fontSize.md, fontWeight: '800', color: colors.accent },

  loyaltyCard: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    padding: spacing.md, gap: spacing.xs, borderLeftWidth: 3, borderLeftColor: colors.textLight,
  },
  loyaltyCardActive: { backgroundColor: '#fff7ed', borderLeftColor: colors.warning },
  loyaltyTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  loyaltyText: { fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 20 },

  jobCard: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm,
  },
  jobTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  jobMeta: { fontSize: fontSize.sm, color: colors.textMuted },
  jobContractor: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600' },
  windowRow: { flexDirection: 'row', justifyContent: 'space-between' },
  windowLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  windowValue: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500' },

  checkRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  checkbox: {
    width: 24, height: 24, borderRadius: 5, borderWidth: 2,
    borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginTop: 2,
  },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkmark: { color: colors.white, fontSize: 14, fontWeight: '800' },
  checkText: { flex: 1, fontSize: fontSize.sm, color: colors.text, lineHeight: 24 },

  nextSteps: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    padding: spacing.md, gap: spacing.sm,
  },
  nextTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  step: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  stepDot: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stepN: { fontSize: fontSize.xs, color: colors.white, fontWeight: '800' },
  stepText: { flex: 1, fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 22 },

  claimBtn: {
    backgroundColor: colors.accent, borderRadius: radius.md,
    padding: spacing.md + 4, alignItems: 'center',
  },
  claimBtnDisabled: { backgroundColor: colors.textLight },
  claimBtnText: { color: colors.white, fontSize: fontSize.md, fontWeight: '700' },

  hint: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center' },

  cancelBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  cancelBtnText: { fontSize: fontSize.sm, color: colors.textMuted },
});
