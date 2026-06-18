import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

type PaymentRecord = {
  id: string;
  sub_payout: number;
  platform_fee_sub: number;
  status: string;
  paid_out_at: string | null;
  created_at: string;
  instant_pay_requested: boolean | null;
  instant_pay_at: string | null;
};

type Job = {
  id: string;
  title: string;
  status: string;
  completed_at: string | null;
  contractor_id: string;
  contractor: { business_name: string } | null;
};

const PIPELINE: { key: string; label: string; detail: string }[] = [
  { key: 'claimed',        label: 'Job Claimed',       detail: 'You committed to this job.' },
  { key: 'in_progress',    label: 'Work Started',      detail: 'Job is underway.' },
  { key: 'pending_review', label: 'Awaiting Release',  detail: 'Contractor reviewing sign-off.' },
  { key: 'released',       label: 'Payment Released',  detail: 'Funds sent to your account.' },
];

const STATUS_ORDER = ['claimed', 'in_progress', 'pending_review', 'released'];

function pipelineIndex(jobStatus: string, payStatus: string): number {
  if (payStatus === 'released') return 3;
  if (payStatus === 'processing') return 2;
  const idx = STATUS_ORDER.indexOf(jobStatus);
  return idx >= 0 ? Math.min(idx, 2) : 0;
}

export default function PayoutStatusScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const router = useRouter();

  const [job, setJob] = useState<Job | null>(null);
  const [payment, setPayment] = useState<PaymentRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: j }, { data: p }] = await Promise.all([
        supabase
          .from('jobs')
          .select('id, title, status, completed_at, contractor_id, contractor:contractor_profiles(business_name)')
          .eq('id', jobId)
          .single(),
        supabase
          .from('payment_records')
          .select('*')
          .eq('job_id', jobId)
          .eq('sub_id', user.id)
          .maybeSingle(),
      ]);

      setJob((j as unknown as Job) ?? null);
      setPayment(p ?? null);
      setLoading(false);
    }
    load();
  }, [jobId]);

  if (loading) return <ActivityIndicator style={styles.loader} color={colors.accent} />;
  if (!job) return <Text style={styles.notFound}>Job not found.</Text>;

  const gross = Number(payment?.sub_payout ?? 0);
  const fee = Number(payment?.platform_fee_sub ?? gross * 0.10);
  const net = gross - fee;
  const payStatus = payment?.status ?? 'pending';
  const currentStep = pipelineIndex(job.status, payStatus);
  const isReleased = payStatus === 'released';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Status hero */}
      <View style={[styles.hero, isReleased && styles.heroReleased]}>
        {isReleased ? (
          <>
            <Text style={styles.heroIcon}>💸</Text>
            <Text style={styles.heroTitle}>Paid Out</Text>
            <Text style={styles.heroAmount}>{fmt(net)}</Text>
            {payment?.paid_out_at && (
              <Text style={styles.heroDate}>
                {new Date(payment.paid_out_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </Text>
            )}
          </>
        ) : (
          <>
            <Text style={styles.heroIcon}>⏳</Text>
            <Text style={styles.heroTitle}>Payment in Progress</Text>
            <Text style={styles.heroAmount}>{fmt(net)}</Text>
            <Text style={styles.heroSub}>
              {job.status === 'pending_review'
                ? 'Waiting for contractor to approve and release'
                : 'Complete the job to trigger payment'}
            </Text>
          </>
        )}
      </View>

      {/* Pipeline steps */}
      <View style={styles.pipelineCard}>
        <Text style={styles.pipelineTitle}>Payment Pipeline</Text>
        {PIPELINE.map((step, i) => {
          const done = i < currentStep;
          const active = i === currentStep;
          return (
            <View key={step.key} style={styles.pipelineRow}>
              <View style={styles.pipelineLeft}>
                <View style={[
                  styles.pipelineDot,
                  done && styles.pipelineDotDone,
                  active && styles.pipelineDotActive,
                ]}>
                  {done
                    ? <Text style={styles.pipelineCheck}>✓</Text>
                    : <Text style={[styles.pipelineNum, active && styles.pipelineNumActive]}>{i + 1}</Text>}
                </View>
                {i < PIPELINE.length - 1 && (
                  <View style={[styles.pipelineLine, done && styles.pipelineLineDone]} />
                )}
              </View>
              <View style={[styles.pipelineBody, active && styles.pipelineBodyActive]}>
                <Text style={[styles.pipelineLabel, done && styles.pipelineLabelDone, active && styles.pipelineLabelActive]}>
                  {step.label}
                </Text>
                {active && <Text style={styles.pipelineDetail}>{step.detail}</Text>}
              </View>
            </View>
          );
        })}
      </View>

      {/* Fee breakdown */}
      {gross > 0 && (
        <View style={styles.breakdownCard}>
          <Text style={styles.breakdownTitle}>Payout Breakdown</Text>
          <BRow label="Gross payout" value={fmt(gross)} />
          <BRow
            label={fee === 0 ? 'Platform fee (waived)' : 'Platform fee (10%)'}
            value={fee === 0 ? '–$0.00' : `-${fmt(fee)}`}
            muted
          />
          <View style={styles.breakdownTotal}>
            <Text style={styles.breakdownTotalLabel}>You receive</Text>
            <Text style={styles.breakdownTotalValue}>{fmt(net)}</Text>
          </View>
          {fee === 0 && (
            <Text style={styles.waivedNote}>🎉 Platform fee waived on this payout</Text>
          )}
        </View>
      )}

      {/* Instant pay info */}
      {!isReleased && (
        <View style={styles.instantCard}>
          <Text style={styles.instantTitle}>⚡ Instant Pay</Text>
          <Text style={styles.instantText}>
            Once the contractor releases payment, you can request Instant Pay to receive funds within minutes
            instead of the standard 1–3 business days. A small processing fee applies.
          </Text>
          {payment?.instant_pay_requested && (
            <View style={styles.instantBadge}>
              <Text style={styles.instantBadgeText}>✓ Instant Pay requested</Text>
            </View>
          )}
        </View>
      )}

      {/* Job link */}
      <TouchableOpacity
        style={styles.jobLink}
        onPress={() => router.push({ pathname: '/(sub)/jobs/[id]', params: { id: jobId } } as any)}
      >
        <View style={styles.flex}>
          <Text style={styles.jobLinkTitle}>{job.title}</Text>
          {job.contractor && (
            <Text style={styles.jobLinkSub}>{job.contractor.business_name}</Text>
          )}
        </View>
        <Text style={styles.jobLinkArrow}>→</Text>
      </TouchableOpacity>

      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

function BRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <View style={styles.bRow}>
      <Text style={[styles.bLabel, muted && styles.bMuted]}>{label}</Text>
      <Text style={[styles.bValue, muted && styles.bMuted]}>{value}</Text>
    </View>
  );
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  loader: { flex: 1, marginTop: spacing.xxl },
  notFound: { textAlign: 'center', marginTop: spacing.xxl, color: colors.textMuted },

  hero: {
    alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.xs,
    backgroundColor: colors.surfaceAlt, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  heroReleased: { backgroundColor: colors.accentLight, borderColor: colors.accent },
  heroIcon: { fontSize: 44 },
  heroTitle: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroAmount: { fontSize: 52, fontWeight: '900', color: colors.accent, marginTop: spacing.xs },
  heroDate: { fontSize: fontSize.sm, color: colors.textMuted },
  heroSub: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing.lg },

  pipelineCard: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
  },
  pipelineTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  pipelineRow: { flexDirection: 'row', gap: spacing.md, minHeight: 48 },
  pipelineLeft: { alignItems: 'center', width: 28, gap: 0 },
  pipelineDot: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 2,
    borderColor: colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  pipelineDotDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  pipelineDotActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  pipelineLine: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  pipelineLineDone: { backgroundColor: colors.accent },
  pipelineCheck: { color: colors.white, fontSize: 14, fontWeight: '800' },
  pipelineNum: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted },
  pipelineNumActive: { color: colors.white },
  pipelineBody: { flex: 1, paddingBottom: spacing.lg, justifyContent: 'flex-start' },
  pipelineBodyActive: {},
  pipelineLabel: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '600', paddingTop: 4 },
  pipelineLabelDone: { color: colors.accent },
  pipelineLabelActive: { color: colors.primary, fontWeight: '700' },
  pipelineDetail: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2, lineHeight: 20 },

  breakdownCard: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm,
  },
  breakdownTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  bRow: { flexDirection: 'row', justifyContent: 'space-between' },
  bLabel: { fontSize: fontSize.sm, color: colors.text },
  bValue: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600' },
  bMuted: { color: colors.textMuted },
  breakdownTotal: {
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.xs,
  },
  breakdownTotalLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  breakdownTotalValue: { fontSize: fontSize.md, fontWeight: '800', color: colors.accent },
  waivedNote: { fontSize: fontSize.xs, color: '#166534', fontWeight: '600' },

  instantCard: {
    backgroundColor: '#fefce8', borderRadius: radius.md,
    borderWidth: 1, borderColor: '#fef08a', padding: spacing.md, gap: spacing.sm,
  },
  instantTitle: { fontSize: fontSize.sm, fontWeight: '700', color: '#713f12' },
  instantText: { fontSize: fontSize.xs, color: '#854d0e', lineHeight: 20 },
  instantBadge: {
    alignSelf: 'flex-start', backgroundColor: '#fef9c3',
    borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 4,
    borderWidth: 1, borderColor: '#fef08a',
  },
  instantBadgeText: { fontSize: fontSize.xs, color: '#713f12', fontWeight: '700' },

  jobLink: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
  },
  flex: { flex: 1 },
  jobLinkTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  jobLinkSub: { fontSize: fontSize.xs, color: colors.textMuted },
  jobLinkArrow: { fontSize: fontSize.lg, color: colors.textMuted },
});
