import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { notify } from '@/lib/notifications';
import RatingStars from '@/components/RatingStars';
import ChangeOrderCard from '@/components/ChangeOrderCard';
import PhotoUpload from '@/components/PhotoUpload';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import type { Job, ChangeOrder, JobMedia } from '@/lib/types';

export default function SubJobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [media, setMedia] = useState<JobMedia[]>([]);
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  // Closeout state
  const [signeeName, setSigneeName] = useState('');
  const [submittingSignoff, setSubmittingSignoff] = useState(false);

  const fetchAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user!.id);
    const [{ data: j }, { data: co }, { data: m }] = await Promise.all([
      supabase.from('jobs').select('*, contractor:contractor_profiles(*)').eq('id', id).single(),
      supabase.from('change_orders').select('*').eq('job_id', id).order('created_at', { ascending: false }),
      supabase.from('job_media').select('*').eq('job_id', id).order('created_at'),
    ]);
    setJob(j);
    setChangeOrders(co ?? []);
    setMedia(m ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleClaim() {
    Alert.alert(
      'Claim This Job',
      `You're committing to complete this job for ${formatCurrency(job!.sub_payout)}. SubHub takes a platform fee from your payout.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Claim Job',
          onPress: async () => {
            setClaiming(true);
            const { error } = await supabase
              .from('jobs')
              .update({ status: 'claimed', claimed_by: userId, claimed_at: new Date().toISOString() })
              .eq('id', id);
            if (error) { Alert.alert('Error', error.message); setClaiming(false); return; }
            await notify.jobClaimed(job!.contractor_id, job!.title, 'A subcontractor');
            setClaiming(false);
            fetchAll();
          },
        },
      ]
    );
  }

  async function handleStartWork() {
    await supabase.from('jobs').update({ status: 'in_progress' }).eq('id', id);
    fetchAll();
  }

  async function handleCustomerSignoff() {
    if (!signeeName.trim()) { Alert.alert('Required', 'Enter the homeowner\'s name to confirm sign-off.'); return; }

    const beforePhotos = media.filter(m => m.phase === 'before');
    const afterPhotos = media.filter(m => m.phase === 'after');
    if (beforePhotos.length === 0 || afterPhotos.length === 0) {
      Alert.alert('Photos Required', 'Upload before and after photos before closing the job.');
      return;
    }

    setSubmittingSignoff(true);
    await supabase.from('customer_signoffs').insert({
      job_id: id,
      signed_by: signeeName.trim(),
      confirmed_by: userId,
    });
    await supabase.from('jobs').update({ status: 'pending_review' }).eq('id', id);
    await notify.jobComplete(job!.contractor_id, job!.title, id);
    setSubmittingSignoff(false);
    fetchAll();
    Alert.alert('Job Submitted', 'The contractor has been notified to review and release payment.');
  }

  async function handleRating(stars: number) {
    await supabase.from('ratings').insert({
      job_id: id,
      rater_id: userId,
      ratee_id: job!.contractor_id,
      stars,
      rehire: stars >= 4,
    });
    Alert.alert('Thanks!', 'Your rating has been submitted.');
  }

  if (loading) return <ActivityIndicator style={styles.loader} color={colors.accent} />;
  if (!job) return <Text style={styles.notFound}>Job not found.</Text>;

  const isMine = job.claimed_by === userId;
  const canClaim = job.status === 'posted';
  const canStart = isMine && job.status === 'claimed';
  const inProgress = isMine && job.status === 'in_progress';
  const isComplete = job.status === 'complete';
  const pendingReview = isMine && job.status === 'pending_review';

  const mediaByPhase = (phase: JobMedia['phase']) => media.filter(m => m.phase === phase);

  const openChangeOrders = changeOrders.filter(co => co.status === 'open');

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.hero}>
          <Text style={styles.payout}>{formatCurrency(job.sub_payout)}</Text>
          <Text style={styles.payoutLabel}>your payout</Text>
        </View>
        <Text style={styles.title}>{job.title}</Text>
        <Text style={styles.location}>📍 {job.city}, {job.state} · {job.estimated_days} day{job.estimated_days !== 1 ? 's' : ''}</Text>

        {job.contractor && (
          <View style={styles.contractorRow}>
            <View style={styles.flex}>
              <Text style={styles.contractorName}>{(job.contractor as any).business_name}</Text>
              <RatingStars value={(job.contractor as any).rating} count={(job.contractor as any).rating_count} size="sm" />
            </View>
          </View>
        )}

        {job.contractor && (
          <View style={styles.rateCard}>
            <Text style={styles.rateCardTitle}>Pre-Agreed Fee Schedule</Text>
            <Text style={styles.rateCardNote}>These rates auto-apply to all change orders on this job.</Text>
            <View style={styles.rateGrid}>
              <RateChip label="Delay pay" value={`$${(job.contractor as any).delay_pay_rate_per_hour ?? 35}/hr`} />
              <RateChip label="Add-on" value={`$${(job.contractor as any).addon_pay_rate_per_lf ?? 15}/LF`} />
              <RateChip label="Return trip" value={`$${(job.contractor as any).return_trip_fee ?? 150}`} />
              <RateChip label="Change order fee" value={`$${(job.contractor as any).change_order_fee ?? 75}`} />
              <RateChip label="Max delay liability" value={`$${(job.contractor as any).delay_liability_cap ?? 500}`} />
              <RateChip label="Payment terms" value={`${(job.contractor as any).payment_terms_days ?? 14} days`} />
            </View>
          </View>
        )}

        <Divider />

        {/* Dispute banner */}
        {job.status === 'disputed' && (
          <View style={styles.disputedBanner}>
            <Text style={styles.disputedTitle}>⚠️ Dispute Filed</Text>
            {(job as any).dispute_reason && (
              <Text style={styles.disputedReason}>Contractor's concern: "{(job as any).dispute_reason}"</Text>
            )}
            <Text style={styles.disputedNote}>
              SubHub has been notified. Use the message thread to work toward a resolution with your contractor.
            </Text>
          </View>
        )}

        {/* Change orders alert */}
        {openChangeOrders.length > 0 && (
          <View style={styles.alertBanner}>
            <Text style={styles.alertText}>⚠️ {openChangeOrders.length} open change order{openChangeOrders.length > 1 ? 's' : ''} need your review</Text>
          </View>
        )}

        {/* Scope */}
        <Section title="Scope of Work">
          <Text style={styles.body}>{job.scope_of_work}</Text>
        </Section>

        {/* Materials */}
        <Section title="Materials">
          <InfoRow label="Supplier" value={job.material_supplier} />
          <InfoRow label="Supplier Location" value={job.material_supplier_address} />
          <InfoRow label="Material Status" value={materialStatusLabel(job.material_status)} highlight />
        </Section>

        {/* Schedule */}
        <Section title="Schedule">
          <InfoRow label="Start Window" value={`${job.start_window_start} → ${job.start_window_end}`} />
          <InfoRow label="Duration" value={`${job.estimated_days} days`} />
        </Section>

        {/* Photos — shown once job is claimed */}
        {isMine && (
          <>
            <Divider />
            <Section title="Job Photos">
              <PhotoUpload
                jobId={id}
                phase="before"
                existing={mediaByPhase('before')}
                onUploaded={(m) => setMedia(prev => [...prev, m])}
                disabled={!canStart && !inProgress}
              />
              <PhotoUpload
                jobId={id}
                phase="during"
                existing={mediaByPhase('during')}
                onUploaded={(m) => setMedia(prev => [...prev, m])}
                disabled={!inProgress}
              />
              <PhotoUpload
                jobId={id}
                phase="after"
                existing={mediaByPhase('after')}
                onUploaded={(m) => setMedia(prev => [...prev, m])}
                disabled={!inProgress}
              />
            </Section>
          </>
        )}

        {/* Change orders */}
        {changeOrders.length > 0 && (
          <>
            <Divider />
            <Section title={`Change Orders (${changeOrders.length})`}>
              {changeOrders.map(co => (
                <ChangeOrderCard
                  key={co.id}
                  changeOrder={co}
                  role="subcontractor"
                  contractorId={job.contractor_id}
                  subId={userId}
                  jobTitle={job.title}
                  onUpdated={fetchAll}
                />
              ))}
            </Section>
          </>
        )}

        {/* Customer sign-off */}
        {inProgress && (
          <>
            <Divider />
            <Section title="Customer Sign-Off">
              <Text style={styles.signoffNote}>
                Collect the homeowner's acknowledgment that the work is complete.
                Once submitted, the contractor will review and release payment.
              </Text>
              <TextInput
                style={styles.input}
                value={signeeName}
                onChangeText={setSigneeName}
                placeholder="Homeowner full name"
                placeholderTextColor={colors.textLight}
              />
            </Section>
          </>
        )}

        {/* Rating — after completion */}
        {isComplete && isMine && (
          <>
            <Divider />
            <Section title="Rate This Contractor">
              <TouchableOpacity
                style={styles.reviewButton}
                onPress={() => router.push(`/(sub)/rate/${job.id}`)}
              >
                <Text style={styles.reviewButtonText}>⭐ Leave a Review</Text>
              </TouchableOpacity>
            </Section>
          </>
        )}

        {/* Spacer for fixed footer */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Fixed action footer */}
      <View style={styles.footer}>
        {canClaim && (
          <TouchableOpacity style={styles.primaryButton} onPress={handleClaim} disabled={claiming}>
            {claiming ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Claim Job — {formatCurrency(job.sub_payout)}</Text>}
          </TouchableOpacity>
        )}
        {canStart && (
          <View style={styles.footerRow}>
            <TouchableOpacity style={[styles.primaryButton, styles.flex]} onPress={handleStartWork}>
              <Text style={styles.primaryButtonText}>Start Work</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.push({ pathname: '/(sub)/change-order', params: { jobId: id } })}
            >
              <Text style={styles.secondaryButtonText}>Change Order</Text>
            </TouchableOpacity>
          </View>
        )}
        {inProgress && (
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={[styles.primaryButton, styles.flex, !signeeName.trim() && styles.buttonDisabled]}
              onPress={handleCustomerSignoff}
              disabled={submittingSignoff || !signeeName.trim()}
            >
              {submittingSignoff
                ? <ActivityIndicator color={colors.white} />
                : <Text style={styles.primaryButtonText}>Submit Job Complete</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.push({ pathname: '/(sub)/change-order', params: { jobId: id } })}
            >
              <Text style={styles.secondaryButtonText}>Change Order</Text>
            </TouchableOpacity>
          </View>
        )}
        {pendingReview && (
          <View style={styles.pendingBox}>
            <Text style={styles.pendingText}>⏳ Waiting for contractor to review and release payment</Text>
          </View>
        )}
        {isMine && (
          <TouchableOpacity
            style={styles.messageButton}
            onPress={() => router.push({ pathname: '/(sub)/chat/[jobId]', params: { jobId: id } })}
          >
            <Text style={styles.messageButtonText}>💬 Message Contractor</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, highlight && styles.infoValueHighlight]}>{value}</Text>
    </View>
  );
}

function RateChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.rateChip}>
      <Text style={styles.rateChipLabel}>{label}</Text>
      <Text style={styles.rateChipValue}>{value}</Text>
    </View>
  );
}

function Divider() { return <View style={styles.divider} />; }

function materialStatusLabel(status: Job['material_status']) {
  if (status === 'on_site') return '✅ On-site';
  if (status === 'local') return '📍 Local pickup (~25 mi)';
  return '🚚 Distant — delivery applies';
}

function formatCurrency(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loader: { marginTop: spacing.xxl },
  notFound: { textAlign: 'center', marginTop: spacing.xxl, color: colors.textMuted },
  content: { padding: spacing.xl, gap: spacing.lg },
  hero: { alignItems: 'center', paddingVertical: spacing.lg },
  payout: { fontSize: 48, fontWeight: '800', color: colors.accent },
  payoutLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  title: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.text },
  location: { fontSize: fontSize.sm, color: colors.textMuted },
  contractorRow: {
    flexDirection: 'row', backgroundColor: colors.surface,
    padding: spacing.md, borderRadius: radius.md,
  },
  flex: { flex: 1 },
  contractorName: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  alertBanner: {
    backgroundColor: '#fef3c7', borderRadius: radius.md,
    padding: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.warning,
  },
  alertText: { fontSize: fontSize.sm, color: '#92400e', fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.border },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  body: { fontSize: fontSize.md, color: colors.text, lineHeight: 22 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  infoLabel: { fontSize: fontSize.sm, color: colors.textMuted, flex: 1 },
  infoValue: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500', flex: 2, textAlign: 'right' },
  infoValueHighlight: { color: colors.primary, fontWeight: '600' },
  signoffNote: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 20 },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, fontSize: fontSize.md, color: colors.text, backgroundColor: colors.surface,
  },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: spacing.md, backgroundColor: colors.background,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  footerRow: { flexDirection: 'row', gap: spacing.sm },
  primaryButton: {
    backgroundColor: colors.accent, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center',
  },
  primaryButtonText: { color: colors.white, fontSize: fontSize.md, fontWeight: '700' },
  buttonDisabled: { backgroundColor: colors.textLight },
  secondaryButton: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, padding: spacing.md, alignItems: 'center', justifyContent: 'center',
  },
  secondaryButtonText: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  pendingBox: {
    backgroundColor: '#fef3c7', borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center',
  },
  pendingText: { fontSize: fontSize.sm, color: '#92400e', fontWeight: '600' },
  reviewButton: {
    borderWidth: 2, borderColor: colors.accent, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center',
  },
  reviewButtonText: { color: colors.accent, fontSize: fontSize.md, fontWeight: '700' },
  rateCard: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md,
    gap: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.primary,
  },
  rateCardTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },
  rateCardNote: { fontSize: fontSize.xs, color: colors.textMuted },
  rateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  rateChip: {
    backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: spacing.sm,
    paddingVertical: 4, borderWidth: 1, borderColor: colors.border,
  },
  rateChipLabel: { fontSize: 10, color: colors.textMuted },
  rateChipValue: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  messageButton: {
    borderWidth: 1, borderColor: colors.accent, borderRadius: radius.md,
    padding: spacing.sm, alignItems: 'center', marginTop: spacing.sm,
  },
  messageButtonText: { color: colors.accent, fontSize: fontSize.sm, fontWeight: '600' },
  disputedBanner: {
    backgroundColor: '#fef2f2', borderRadius: radius.md, padding: spacing.md,
    gap: spacing.xs, borderLeftWidth: 3, borderLeftColor: colors.error,
  },
  disputedTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.error },
  disputedReason: { fontSize: fontSize.sm, color: colors.text, fontStyle: 'italic' },
  disputedNote: { fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 18 },
});
