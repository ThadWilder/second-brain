import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, TextInput, Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useStripe } from '@stripe/stripe-react-native';
import { supabase } from '@/lib/supabase';
import { createPaymentIntent, initiateSubPayout } from '@/lib/stripe';
import { notify } from '@/lib/notifications';
import RatingStars from '@/components/RatingStars';
import ChangeOrderCard from '@/components/ChangeOrderCard';
import PhotoUpload from '@/components/PhotoUpload';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import type { Job, ChangeOrder, JobMedia } from '@/lib/types';

export default function ContractorJobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { confirmPayment } = useStripe();
  const [job, setJob] = useState<Job | null>(null);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [media, setMedia] = useState<JobMedia[]>([]);
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [submittingDispute, setSubmittingDispute] = useState(false);
  const [dispute, setDispute] = useState<any>(null);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [evidenceNote, setEvidenceNote] = useState('');
  const [submittingEvidence, setSubmittingEvidence] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [callLog, setCallLog] = useState<any[]>([]);
  const [calling, setCalling] = useState(false);

  const fetchAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user!.id);
    const [{ data: j }, { data: co }, { data: m }, { data: d }, { data: msgs }, { data: calls }] = await Promise.all([
      supabase.from('jobs').select('*, claimed_sub:sub_profiles!claimed_by(*)').eq('id', id).single(),
      supabase.from('change_orders').select('*').eq('job_id', id).order('created_at', { ascending: false }),
      supabase.from('job_media').select('*').eq('job_id', id).order('created_at'),
      supabase.from('disputes').select('*').eq('job_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('messages').select('*').eq('job_id', id).order('created_at', { ascending: false }).limit(5),
      supabase.from('call_log').select('*').eq('job_id', id).order('created_at', { ascending: false }).limit(5),
    ]);
    setJob(j);
    setChangeOrders(co ?? []);
    setMedia(m ?? []);
    setDispute(d ?? null);
    setMessages((msgs ?? []).reverse());
    setCallLog(calls ?? []);
    if (d) {
      const { data: ev } = await supabase.from('dispute_evidence').select('*').eq('dispute_id', d.id).order('created_at');
      setEvidence(ev ?? []);
    } else {
      setEvidence([]);
    }
    setLoading(false);
  }, [id]);

  async function handleCall() {
    Alert.alert(
      'Call Sub',
      "SubHub will call your phone and connect you to the subcontractor. Neither party will see the other's real number.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Call Now', onPress: async () => {
            setCalling(true);
            try {
              const { error } = await supabase.functions.invoke('call-connect', { body: { jobId: id } });
              if (error) throw new Error(error.message);
              Alert.alert('Calling…', 'SubHub is connecting your call. Your phone will ring shortly.');
              fetchAll();
            } catch (err) {
              Alert.alert('Call Failed', (err as Error).message);
            } finally {
              setCalling(false);
            }
          },
        },
      ]
    );
  }

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleReleasePayment() {
    Alert.alert(
      'Release Payment?',
      `This will charge your card and send ${formatCurrency(job!.sub_payout)} to the subcontractor.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Release Payment', onPress: async () => {
            setPaying(true);
            try {
              const clientSecret = await createPaymentIntent(id);
              const { error } = await confirmPayment(clientSecret);
              if (error) throw new Error(error.message);
              await initiateSubPayout(id);
              await notify.paymentReleased(job!.claimed_by!, job!.sub_payout);
              try {
                await supabase.functions.invoke('compute-job-success', { body: { subUserId: job!.claimed_by } });
              } catch { /* fire and forget */ }
              fetchAll();
              Alert.alert('Payment Released', 'The subcontractor has been paid.');
            } catch (err) {
              Alert.alert('Payment Failed', (err as Error).message);
            } finally {
              setPaying(false);
            }
          },
        },
      ]
    );
  }

  async function handleDispute() {
    if (!disputeReason.trim()) { Alert.alert('Required', 'Please describe the issue before filing a dispute.'); return; }
    setSubmittingDispute(true);
    await supabase.from('jobs').update({ status: 'disputed', dispute_reason: disputeReason.trim() }).eq('id', id);
    await supabase.from('disputes').insert({
      job_id: id,
      opened_by: userId,
      opener_role: 'contractor',
      reason: disputeReason.trim(),
      status: 'open',
    });
    if (job!.claimed_by) await notify.disputeOpened(job!.claimed_by, job!.title, id);
    setSubmittingDispute(false);
    setDisputing(false);
    setDisputeReason('');
    fetchAll();
  }

  async function handleAddEvidence() {
    if (!evidenceNote.trim() || !dispute) return;
    setSubmittingEvidence(true);
    await supabase.from('dispute_evidence').insert({
      dispute_id: dispute.id,
      submitted_by: userId,
      submitter_role: 'contractor',
      note: evidenceNote.trim(),
    });
    setEvidenceNote('');
    setSubmittingEvidence(false);
    fetchAll();
  }

  async function handleResolveDispute(approve: boolean) {
    Alert.alert(
      approve ? 'Approve & Release Payment?' : 'Cancel Job?',
      approve
        ? 'This releases payment to the sub and closes the dispute.'
        : 'This cancels the job. No payment will be released.',
      [
        { text: 'Back', style: 'cancel' },
        {
          text: approve ? 'Release Payment' : 'Cancel Job',
          style: approve ? 'default' : 'destructive',
          onPress: async () => {
            if (approve) {
              setPaying(true);
              try {
                const clientSecret = await createPaymentIntent(id);
                const { error } = await confirmPayment(clientSecret);
                if (error) throw new Error(error.message);
                await initiateSubPayout(id);
                await notify.paymentReleased(job!.claimed_by!, job!.sub_payout);
                if (dispute) {
                  await supabase.from('disputes').update({
                    status: 'resolved_paid',
                    resolved_by: userId,
                    resolved_at: new Date().toISOString(),
                  }).eq('id', dispute.id);
                  await notify.disputeResolved(job!.claimed_by!, job!.title, 'Payment released to the sub.');
                }
                try {
                  await supabase.functions.invoke('compute-job-success', { body: { subUserId: job!.claimed_by } });
                } catch { /* fire and forget */ }
                fetchAll();
              } catch (err) {
                Alert.alert('Payment Failed', (err as Error).message);
              } finally {
                setPaying(false);
              }
            } else {
              await supabase.from('jobs').update({ status: 'draft', claimed_by: null, claimed_at: null }).eq('id', id);
              if (dispute) {
                await supabase.from('disputes').update({
                  status: 'resolved_cancelled',
                  resolved_by: userId,
                  resolved_at: new Date().toISOString(),
                }).eq('id', dispute.id);
                if (job!.claimed_by) await notify.disputeResolved(job!.claimed_by, job!.title, 'Job cancelled — no payment.');
              }
              router.back();
            }
          },
        },
      ]
    );
  }

  async function handleRating(stars: number) {
    await supabase.from('ratings').insert({
      job_id: id,
      rater_id: userId,
      ratee_id: job!.claimed_by,
      stars,
      rehire: stars >= 4,
    });
    try {
      await supabase.functions.invoke('compute-job-success', { body: { subUserId: job!.claimed_by } });
    } catch { /* fire and forget */ }
    Alert.alert('Thanks!', 'Your rating has been submitted.');
  }

  async function handleCancel() {
    Alert.alert('Cancel Job?', 'This will remove the listing from the board.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel Job', style: 'destructive', onPress: async () => {
          await supabase.from('jobs').update({ status: 'draft' }).eq('id', id);
          router.back();
        },
      },
    ]);
  }

  if (loading) return <ActivityIndicator style={styles.loader} color={colors.primary} />;
  if (!job) return <Text style={styles.notFound}>Job not found.</Text>;

  const sub = job.claimed_sub as any;
  const openChangeOrders = changeOrders.filter(co => co.status === 'open');
  const mediaByPhase = (phase: JobMedia['phase']) => media.filter(m => m.phase === phase);

  const isPendingReview = job.status === 'pending_review';
  const isComplete = job.status === 'complete';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Title + status */}
        <View style={styles.headerRow}>
          <Text style={styles.title}>{job.title}</Text>
          <StatusPill status={job.status} />
        </View>
        <Text style={styles.location}>📍 {job.address}, {job.city}, {job.state}</Text>
        <Text style={styles.payout}>
          Sub payout: <Text style={styles.payoutAmount}>{formatCurrency(job.sub_payout)}</Text>
        </Text>

        {/* Change orders alert */}
        {openChangeOrders.length > 0 && (
          <View style={styles.alertBanner}>
            <Text style={styles.alertText}>⚠️ {openChangeOrders.length} open change order{openChangeOrders.length > 1 ? 's' : ''} need your approval</Text>
          </View>
        )}

        {/* Sub info */}
        {sub && (
          <View style={styles.subCard}>
            <Text style={styles.subCardLabel}>Claimed by</Text>
            <Text style={styles.subName}>{sub.name}</Text>
            <RatingStars value={sub.rating} count={sub.rating_count} size="sm" />
            {sub.verified && <Text style={styles.verified}>✓ Verified</Text>}
          </View>
        )}

        {/* Communications — visible whenever a sub is on the job */}
        {sub && (
          <>
            <Divider />
            <Section title="Communications">
              <View style={styles.commsActions}>
                <TouchableOpacity
                  style={[styles.commsBtn, styles.callBtn]}
                  onPress={handleCall}
                  disabled={calling}
                >
                  {calling
                    ? <ActivityIndicator color={colors.white} size="small" />
                    : <Text style={styles.commsBtnText}>📞  Call Sub</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.commsBtn, styles.msgBtn]}
                  onPress={() => router.push({ pathname: '/(contractor)/chat/[jobId]', params: { jobId: id } })}
                >
                  <Text style={[styles.commsBtnText, { color: colors.primary }]}>💬  Message</Text>
                </TouchableOpacity>
              </View>
              {messages.length > 0 && (
                <View style={styles.msgPreview}>
                  {messages.slice(-3).map(msg => (
                    <TouchableOpacity
                      key={msg.id}
                      style={styles.msgPreviewRow}
                      onPress={() => router.push({ pathname: '/(contractor)/chat/[jobId]', params: { jobId: id } })}
                    >
                      <Text style={styles.msgPreviewRole}>
                        {msg.sender_role === 'contractor' ? 'You' : sub.name ?? 'Sub'}
                      </Text>
                      <Text style={styles.msgPreviewBody} numberOfLines={1}>{msg.body}</Text>
                      <Text style={styles.msgPreviewTime}>{timeAgo(msg.created_at)}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: '/(contractor)/chat/[jobId]', params: { jobId: id } })}
                  >
                    <Text style={styles.viewThread}>View full thread →</Text>
                  </TouchableOpacity>
                </View>
              )}
              {callLog.length > 0 && (
                <View style={styles.callLogList}>
                  {callLog.map(c => (
                    <Text key={c.id} style={styles.callLogRow}>
                      📞 {c.initiated_by_role === 'contractor' ? 'You called' : 'Sub called'}  ·  {timeAgo(c.created_at)}
                    </Text>
                  ))}
                </View>
              )}
            </Section>
          </>
        )}

        <Divider />

        <Section title="Scope">
          <Text style={styles.body}>{job.scope_of_work}</Text>
        </Section>

        <Section title="Materials">
          <InfoRow label="Supplier" value={job.material_supplier} />
          <InfoRow label="Status" value={job.material_status.replace('_', ' ')} />
        </Section>

        <Section title="Schedule">
          <InfoRow label="Start Window" value={`${job.start_window_start} → ${job.start_window_end}`} />
          <InfoRow label="Duration" value={`${job.estimated_days} days`} />
        </Section>

        {/* Photos */}
        {sub && (
          <>
            <Divider />
            <Section title="Job Photos">
              <PhotoUpload jobId={id} phase="before" existing={mediaByPhase('before')} onUploaded={() => fetchAll()} disabled />
              <PhotoUpload jobId={id} phase="during" existing={mediaByPhase('during')} onUploaded={() => fetchAll()} disabled />
              <PhotoUpload jobId={id} phase="after" existing={mediaByPhase('after')} onUploaded={() => fetchAll()} disabled />
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
                  role="contractor"
                  contractorId={userId}
                  subId={job.claimed_by ?? ''}
                  jobTitle={job.title}
                  onUpdated={fetchAll}
                />
              ))}
            </Section>
          </>
        )}

        {/* Rating — after completion */}
        {isComplete && sub && (
          <>
            <Divider />
            <Section title="Rate This Sub">
              <RatingStars value={0} interactive onRate={handleRating} size="lg" />
            </Section>
          </>
        )}

        {/* Cancel (open jobs only) */}
        {job.status === 'posted' && (
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
            <Text style={styles.cancelText}>Cancel Job</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Footer actions */}
      <View style={styles.footer}>
        {job.status === 'in_progress' && (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push({ pathname: '/(contractor)/change-order', params: { jobId: id } })}
          >
            <Text style={styles.secondaryButtonText}>File Change Order</Text>
          </TouchableOpacity>
        )}
        {isPendingReview && !disputing && (
          <View style={styles.reviewBox}>
            <Text style={styles.reviewTitle}>Sub has marked this job complete</Text>
            <Text style={styles.reviewSub}>Review photos and sign-off, then release payment or file a dispute.</Text>
            <View style={styles.footerRow}>
              <TouchableOpacity style={[styles.payButton, styles.flex]} onPress={handleReleasePayment} disabled={paying}>
                {paying
                  ? <ActivityIndicator color={colors.white} />
                  : <Text style={styles.payButtonText}>Release Payment — {formatCurrency(job.sub_payout)}</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.disputeButton} onPress={() => setDisputing(true)}>
                <Text style={styles.disputeButtonText}>Dispute</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {isPendingReview && disputing && (
          <View style={styles.disputeForm}>
            <Text style={styles.disputeFormTitle}>What's the issue?</Text>
            <TextInput
              style={styles.disputeInput}
              value={disputeReason}
              onChangeText={setDisputeReason}
              placeholder="Describe the problem — missing work, wrong install, safety issue..."
              placeholderTextColor={colors.textLight}
              multiline
              numberOfLines={3}
              autoFocus
            />
            <View style={styles.footerRow}>
              <TouchableOpacity style={[styles.secondaryButton, styles.flex]} onPress={() => setDisputing(false)}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.disputeSubmitButton, styles.flex]}
                onPress={handleDispute}
                disabled={submittingDispute || !disputeReason.trim()}
              >
                {submittingDispute
                  ? <ActivityIndicator color={colors.white} />
                  : <Text style={styles.disputeSubmitText}>File Dispute</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}
        {job.status === 'disputed' && (
          <ScrollView style={styles.disputePanelScroll} contentContainerStyle={styles.disputedBox}>
            <Text style={styles.disputedTitle}>⚠️ Dispute in Progress</Text>
            {dispute?.reason
              ? <Text style={styles.disputedReason}>"{dispute.reason}"</Text>
              : (job as any).dispute_reason
                ? <Text style={styles.disputedReason}>"{(job as any).dispute_reason}"</Text>
                : null}
            {dispute && (
              <Text style={styles.disputeOpener}>
                Opened by {dispute.opener_role === 'contractor' ? 'you (contractor)' : 'the subcontractor'}
              </Text>
            )}
            <Text style={styles.disputedSub}>SubHub is reviewing this dispute.</Text>

            <EvidenceThread evidence={evidence} />

            {dispute && (
              <View style={styles.evidenceForm}>
                <TextInput
                  style={styles.disputeInput}
                  value={evidenceNote}
                  onChangeText={setEvidenceNote}
                  placeholder="Add evidence or context — what happened, any details..."
                  placeholderTextColor={colors.textLight}
                  multiline
                  numberOfLines={3}
                />
                <TouchableOpacity
                  style={[styles.disputeSubmitButton, (!evidenceNote.trim() || submittingEvidence) && styles.buttonDisabled]}
                  onPress={handleAddEvidence}
                  disabled={submittingEvidence || !evidenceNote.trim()}
                >
                  {submittingEvidence
                    ? <ActivityIndicator color={colors.white} />
                    : <Text style={styles.disputeSubmitText}>Add Evidence</Text>}
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.disputedSub}>Resolve this job:</Text>
            <View style={styles.footerRow}>
              <TouchableOpacity style={[styles.payButton, styles.flex]} onPress={() => handleResolveDispute(true)} disabled={paying}>
                {paying ? <ActivityIndicator color={colors.white} /> : <Text style={styles.payButtonText}>Approve & Pay</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.disputeButton]} onPress={() => handleResolveDispute(false)}>
                <Text style={styles.disputeButtonText}>Cancel Job</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors_map: Record<string, string> = {
    posted: '#3b82f6', claimed: '#f59e0b', in_progress: '#8b5cf6',
    pending_review: '#f59e0b', complete: '#22c55e', disputed: '#ef4444',
  };
  const color = colors_map[status] ?? colors.textLight;
  return (
    <View style={[styles.pill, { backgroundColor: color + '20' }]}>
      <Text style={[styles.pillText, { color }]}>{status.replace('_', ' ')}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function Divider() { return <View style={styles.divider} />; }

function EvidenceThread({ evidence }: { evidence: any[] }) {
  if (evidence.length === 0) {
    return <Text style={styles.evidenceEmpty}>No evidence submitted yet.</Text>;
  }
  return (
    <View style={styles.evidenceThread}>
      {evidence.map((e) => (
        <View key={e.id} style={styles.evidenceItem}>
          <Text style={styles.evidenceRole}>{e.submitter_role}</Text>
          {e.note ? <Text style={styles.evidenceNote}>{e.note}</Text> : null}
          {Array.isArray(e.photo_urls) && e.photo_urls.length > 0 && (
            <View style={styles.evidencePhotos}>
              {e.photo_urls.map((url: string, i: number) => (
                <Image key={i} source={{ uri: url }} style={styles.evidencePhoto} />
              ))}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

function formatCurrency(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loader: { marginTop: spacing.xxl },
  notFound: { textAlign: 'center', marginTop: spacing.xxl, color: colors.textMuted },
  content: { padding: spacing.xl, gap: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { flex: 1, fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: fontSize.xs, fontWeight: '600', textTransform: 'capitalize' },
  location: { fontSize: fontSize.sm, color: colors.textMuted },
  payout: { fontSize: fontSize.md, color: colors.textMuted },
  payoutAmount: { color: colors.accent, fontWeight: '700' },
  alertBanner: {
    backgroundColor: '#fef3c7', borderRadius: radius.md,
    padding: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.warning,
  },
  alertText: { fontSize: fontSize.sm, color: '#92400e', fontWeight: '600' },
  subCard: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, gap: spacing.xs,
    borderLeftWidth: 3, borderLeftColor: colors.accent,
  },
  subCardLabel: { fontSize: fontSize.xs, color: colors.textMuted, textTransform: 'uppercase' },
  subName: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  verified: { fontSize: fontSize.xs, color: colors.accent, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.border },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  body: { fontSize: fontSize.md, color: colors.text, lineHeight: 22 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  infoLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  infoValue: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500' },
  cancelButton: {
    borderWidth: 1, borderColor: colors.error, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center',
  },
  cancelText: { color: colors.error, fontWeight: '600' },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: spacing.md, backgroundColor: colors.background,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  footerRow: { flexDirection: 'row', gap: spacing.sm },
  secondaryButton: {
    flex: 1, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md,
    padding: spacing.sm, alignItems: 'center',
  },
  secondaryButtonText: { color: colors.primary, fontWeight: '600', fontSize: fontSize.sm },
  reviewBox: { gap: spacing.sm },
  reviewTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  reviewSub: { fontSize: fontSize.sm, color: colors.textMuted },
  payButton: {
    backgroundColor: colors.accent, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center',
  },
  payButtonText: { color: colors.white, fontSize: fontSize.md, fontWeight: '700' },
  flex: { flex: 1 },
  commsActions: {
    flexDirection: 'row', gap: spacing.sm,
  },
  commsBtn: {
    flex: 1, borderRadius: radius.md, paddingVertical: spacing.sm + 2,
    alignItems: 'center', justifyContent: 'center',
  },
  callBtn: {
    backgroundColor: colors.primary,
  },
  msgBtn: {
    borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.white,
  },
  commsBtnText: {
    color: colors.white, fontWeight: '700', fontSize: fontSize.sm,
  },
  msgPreview: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.sm, gap: 2, marginTop: spacing.xs,
  },
  msgPreviewRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 4,
  },
  msgPreviewRole: {
    fontSize: fontSize.xs, fontWeight: '700', color: colors.primary, minWidth: 36,
  },
  msgPreviewBody: {
    flex: 1, fontSize: fontSize.sm, color: colors.text,
  },
  msgPreviewTime: {
    fontSize: fontSize.xs, color: colors.textMuted,
  },
  viewThread: {
    fontSize: fontSize.xs, color: colors.primary, fontWeight: '600',
    marginTop: spacing.xs, textAlign: 'right',
  },
  callLogList: {
    marginTop: spacing.xs, gap: 2,
  },
  callLogRow: {
    fontSize: fontSize.xs, color: colors.textMuted, paddingVertical: 2,
  },
  disputeButton: {
    borderWidth: 1, borderColor: colors.error, borderRadius: radius.md,
    paddingHorizontal: spacing.md, padding: spacing.sm, alignItems: 'center', justifyContent: 'center',
  },
  disputeButtonText: { color: colors.error, fontSize: fontSize.sm, fontWeight: '600' },
  disputeForm: { gap: spacing.sm },
  disputeFormTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  disputeInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.sm, fontSize: fontSize.sm, color: colors.text,
    backgroundColor: colors.surface, minHeight: 72, textAlignVertical: 'top',
  },
  disputeSubmitButton: {
    backgroundColor: colors.error, borderRadius: radius.md,
    padding: spacing.sm, alignItems: 'center',
  },
  disputeSubmitText: { color: colors.white, fontWeight: '700', fontSize: fontSize.sm },
  disputedBox: {
    backgroundColor: '#fef2f2', borderRadius: radius.md, padding: spacing.md,
    gap: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.error,
  },
  disputedTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.error },
  disputedReason: { fontSize: fontSize.sm, color: colors.text, fontStyle: 'italic' },
  disputedSub: { fontSize: fontSize.sm, color: colors.textMuted },
  disputeOpener: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '600' },
  disputePanelScroll: { maxHeight: 420 },
  buttonDisabled: { backgroundColor: colors.textLight },
  evidenceForm: { gap: spacing.sm },
  evidenceThread: { gap: spacing.sm },
  evidenceEmpty: { fontSize: fontSize.sm, color: colors.textMuted, fontStyle: 'italic' },
  evidenceItem: {
    backgroundColor: colors.white, borderRadius: radius.sm, padding: spacing.sm, gap: 4,
    borderWidth: 1, borderColor: colors.border,
  },
  evidenceRole: { fontSize: fontSize.xs, fontWeight: '700', color: colors.primary, textTransform: 'capitalize' },
  evidenceNote: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },
  evidencePhotos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 4 },
  evidencePhoto: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.surface },
});
