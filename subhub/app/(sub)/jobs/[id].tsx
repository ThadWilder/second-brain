import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, TextInput, Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { notify } from '@/lib/notifications';
import RatingStars from '@/components/RatingStars';
import ChangeOrderCard from '@/components/ChangeOrderCard';
import PhotoUpload from '@/components/PhotoUpload';
import { isDemoId, getDemoJob, getDemoMessages } from '@/lib/demo';
import { shareJob } from '@/lib/referrals';
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
  const [questions, setQuestions] = useState<any[]>([]);
  const [newQuestion, setNewQuestion] = useState('');
  const [submittingQ, setSubmittingQ] = useState(false);

  // AI analysis
  const [analysis, setAnalysis] = useState<{ score: string; headline: string; bullets: string[]; watch_out: string | null } | null>(null);
  const [analyzingJob, setAnalyzingJob] = useState(false);

  // Closeout state
  const [signeeName, setSigneeName] = useState('');
  const [submittingSignoff, setSubmittingSignoff] = useState(false);

  // Rating gate — must rate contractor before submitting sign-off
  const [hasRated, setHasRated] = useState(false);
  const [pendingStars, setPendingStars] = useState(0);

  // Dispute state
  const [dispute, setDispute] = useState<any>(null);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [openingDispute, setOpeningDispute] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [submittingDispute, setSubmittingDispute] = useState(false);
  const [evidenceNote, setEvidenceNote] = useState('');
  const [submittingEvidence, setSubmittingEvidence] = useState(false);

  // Communications
  const [messages, setMessages] = useState<any[]>([]);
  const [callLog, setCallLog] = useState<any[]>([]);
  const [calling, setCalling] = useState(false);

  const demo = isDemoId(id);

  const fetchAll = useCallback(async () => {
    // Demo jobs are served entirely from local data — no DB round-trips.
    if (isDemoId(id)) {
      const dj = getDemoJob(id);
      setJob(dj);
      setMessages(getDemoMessages(id));
      setChangeOrders([]);
      setMedia([]);
      setQuestions([]);
      setDispute(null);
      setEvidence([]);
      setCallLog([]);
      setLoading(false);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user!.id);
    const [{ data: j }, { data: co }, { data: m }, { data: qs }, { data: d }, { data: msgs }, { data: calls }, { data: myRating }] = await Promise.all([
      supabase.from('jobs').select('*, contractor:contractor_profiles(*)').eq('id', id).single(),
      supabase.from('change_orders').select('*').eq('job_id', id).order('created_at', { ascending: false }),
      supabase.from('job_media').select('*').eq('job_id', id).order('created_at'),
      supabase.from('job_questions').select('*').eq('job_id', id).order('created_at'),
      supabase.from('disputes').select('*').eq('job_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('messages').select('*').eq('job_id', id).order('created_at', { ascending: false }).limit(5),
      supabase.from('call_log').select('*').eq('job_id', id).order('created_at', { ascending: false }).limit(5),
      supabase.from('ratings').select('id').eq('job_id', id).eq('rater_id', user!.id).maybeSingle(),
    ]);
    setJob(j);
    setChangeOrders(co ?? []);
    setMedia(m ?? []);
    setQuestions(qs ?? []);
    setDispute(d ?? null);
    setMessages((msgs ?? []).reverse());
    setCallLog(calls ?? []);
    setHasRated(!!myRating);
    if (d) {
      const { data: ev } = await supabase.from('dispute_evidence').select('*').eq('dispute_id', d.id).order('created_at');
      setEvidence(ev ?? []);
    } else {
      setEvidence([]);
    }
    setLoading(false);
    if (user) {
      supabase.from('job_views').insert({ job_id: id, viewer_id: user.id }).then(() => {});
    }
  }, [id]);

  async function handleCall() {
    if (demo) {
      Alert.alert('Demo Job', 'On a real job, SubHub places the call and connects you to the contractor — neither party ever sees the other\'s real number.');
      return;
    }
    Alert.alert(
      'Call Contractor',
      "SubHub will call your phone and connect you to the contractor. Neither party will see the other's real number.",
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

  async function analyzeJob() {
    if (demo) {
      setAnalysis({
        score: 'great',
        headline: 'Strong payout for the day count — worth claiming.',
        bullets: [
          'Payout lands above the board average for this trade and duration.',
          'Material is staged/on-site, so no sourcing delay or pickup drive.',
          'Scope is clearly defined with gate hardware and haul-off spelled out.',
        ],
        watch_out: 'Confirm the start window fits your schedule before claiming.',
      });
      return;
    }
    setAnalyzingJob(true);
    const { data, error } = await supabase.functions.invoke('analyze-job', {
      body: { jobId: id },
    });
    setAnalyzingJob(false);
    if (error || data?.error) {
      Alert.alert('Analysis failed', error?.message ?? data?.error);
      return;
    }
    setAnalysis(data);
  }

  function handleClaim() {
    if (demo) {
      Alert.alert('Demo Job', 'This is a sample listing to show how the board works. Real jobs are claimed the same way — sign up to start claiming.');
      return;
    }
    router.push({ pathname: '/(sub)/claim-confirm/[id]', params: { id } } as any);
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

    if (!hasRated) {
      Alert.alert('Rate First', 'Please rate the contractor before submitting job completion.');
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
    setHasRated(true);
    setPendingStars(stars);
  }

  async function askQuestion() {
    if (!newQuestion.trim()) return;
    setSubmittingQ(true);
    const { data: { user: u } } = await supabase.auth.getUser();
    await supabase.from('job_questions').insert({
      job_id: id,
      asker_id: u!.id,
      question: newQuestion.trim(),
    });
    setNewQuestion('');
    setSubmittingQ(false);
    fetchAll();
  }

  async function handleOpenDispute() {
    if (!disputeReason.trim()) { Alert.alert('Required', 'Please describe the issue before opening a dispute.'); return; }
    setSubmittingDispute(true);
    await supabase.from('disputes').insert({
      job_id: id,
      opened_by: userId,
      opener_role: 'subcontractor',
      reason: disputeReason.trim(),
      status: 'open',
    });
    await supabase.from('jobs').update({ status: 'disputed', dispute_reason: disputeReason.trim() }).eq('id', id);
    await notify.disputeOpened(job!.contractor_id, job!.title, id);
    setSubmittingDispute(false);
    setOpeningDispute(false);
    setDisputeReason('');
    fetchAll();
  }

  async function handleAddEvidence() {
    if (!evidenceNote.trim() || !dispute) return;
    setSubmittingEvidence(true);
    await supabase.from('dispute_evidence').insert({
      dispute_id: dispute.id,
      submitted_by: userId,
      submitter_role: 'subcontractor',
      note: evidenceNote.trim(),
    });
    setEvidenceNote('');
    setSubmittingEvidence(false);
    fetchAll();
  }

  if (loading) return <ActivityIndicator style={styles.loader} color={colors.accent} />;
  if (!job) return <Text style={styles.notFound}>Job not found.</Text>;

  const isMine = job.claimed_by === userId;
  const myClaimPending = (job as any).pending_claim_by === userId && job.status === 'posted';
  const claimPendingOther = !!(job as any).pending_claim_by && (job as any).pending_claim_by !== userId && job.status === 'posted';
  const canClaim = job.status === 'posted' && !(job as any).pending_claim_by;
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
        <TouchableOpacity
          style={styles.shareBtn}
          onPress={() => shareJob({ id: job.id, industry: job.industry, sub_payout: job.sub_payout, city: job.city, state: job.state })}
        >
          <Text style={styles.shareBtnText}>↗ Share this job</Text>
        </TouchableOpacity>

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

        {/* Communications — visible once sub has claimed the job (and always
            for demo jobs, so the messaging experience can be previewed). */}
        {(isMine || demo) && (
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
                    : <Text style={styles.commsBtnText}>📞  Call Contractor</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.commsBtn, styles.msgBtn]}
                  onPress={() => router.push({ pathname: '/(sub)/chat/[jobId]', params: { jobId: id } })}
                >
                  <Text style={[styles.commsBtnText, { color: colors.accent }]}>💬  Message</Text>
                </TouchableOpacity>
              </View>
              {messages.length > 0 && (
                <View style={styles.msgPreview}>
                  {messages.slice(-3).map(msg => (
                    <TouchableOpacity
                      key={msg.id}
                      style={styles.msgPreviewRow}
                      onPress={() => router.push({ pathname: '/(sub)/chat/[jobId]', params: { jobId: id } })}
                    >
                      <Text style={styles.msgPreviewRole}>
                        {msg.sender_role === 'subcontractor' ? 'You' : 'Contractor'}
                      </Text>
                      <Text style={styles.msgPreviewBody} numberOfLines={1}>{msg.body}</Text>
                      <Text style={styles.msgPreviewTime}>{timeAgo(msg.created_at)}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: '/(sub)/chat/[jobId]', params: { jobId: id } })}
                  >
                    <Text style={styles.viewThread}>View full thread →</Text>
                  </TouchableOpacity>
                </View>
              )}
              {callLog.length > 0 && (
                <View style={styles.callLogList}>
                  {callLog.map(c => (
                    <Text key={c.id} style={styles.callLogRow}>
                      📞 {c.initiated_by_role === 'subcontractor' ? 'You called' : 'Contractor called'}  ·  {timeAgo(c.created_at)}
                    </Text>
                  ))}
                </View>
              )}
            </Section>
          </>
        )}

        {/* AI job analysis */}
        {!analysis && (
          <TouchableOpacity
            style={[styles.analyzeButton, analyzingJob && styles.analyzeButtonDisabled]}
            onPress={analyzeJob}
            disabled={analyzingJob}
          >
            {analyzingJob
              ? <ActivityIndicator color={colors.primary} size="small" />
              : <Text style={styles.analyzeButtonText}>✨ Analyze This Job</Text>}
          </TouchableOpacity>
        )}
        {analysis && (
          <View style={[
            styles.analysisCard,
            analysis.score === 'great' && styles.analysisGreat,
            analysis.score === 'low' && styles.analysisLow,
          ]}>
            <View style={styles.analysisHeader}>
              <Text style={styles.analysisBadge}>
                {analysis.score === 'great' ? '🟢 Great' : analysis.score === 'fair' ? '🟡 Fair' : '🔴 Low'}
              </Text>
              <TouchableOpacity onPress={() => setAnalysis(null)}>
                <Text style={styles.analysisDismiss}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.analysisHeadline}>{analysis.headline}</Text>
            {analysis.bullets.map((b, i) => (
              <Text key={i} style={styles.analysisBullet}>• {b}</Text>
            ))}
            {analysis.watch_out && (
              <View style={styles.analysisWatchOut}>
                <Text style={styles.analysisWatchOutText}>⚠️ {analysis.watch_out}</Text>
              </View>
            )}
          </View>
        )}

        <Divider />

        {/* Dispute banner */}
        {job.status === 'disputed' && (
          <View style={styles.disputedBanner}>
            <Text style={styles.disputedTitle}>⚠️ Dispute Filed</Text>
            {(dispute?.reason || (job as any).dispute_reason) && (
              <Text style={styles.disputedReason}>
                {dispute?.opener_role === 'subcontractor' ? 'Your concern' : "Contractor's concern"}: "{dispute?.reason ?? (job as any).dispute_reason}"
              </Text>
            )}
            <Text style={styles.disputedNote}>
              SubHub is reviewing this dispute. Add evidence below to support your case.
            </Text>

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

        {/* Q&A */}
        <Section title="Questions & Answers">
          {questions.length === 0 && (
            <Text style={styles.qaEmpty}>No questions yet. Ask the contractor below.</Text>
          )}
          {questions.map((q: any) => (
            <View key={q.id} style={styles.qaItem}>
              <Text style={styles.qaQuestion}>Q: {q.question}</Text>
              {q.answer
                ? <Text style={styles.qaAnswer}>A: {q.answer}</Text>
                : <Text style={styles.qaPending}>Awaiting contractor response</Text>}
            </View>
          ))}
          {canClaim && (
            <View style={styles.qaInputRow}>
              <TextInput
                style={[styles.input, styles.qaInput]}
                value={newQuestion}
                onChangeText={setNewQuestion}
                placeholder="Ask a question before claiming..."
                placeholderTextColor={colors.textLight}
              />
              <TouchableOpacity
                style={[styles.qaSubmitBtn, !newQuestion.trim() && styles.buttonDisabled]}
                onPress={askQuestion}
                disabled={submittingQ || !newQuestion.trim()}
              >
                {submittingQ ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.qaSubmitText}>Ask</Text>}
              </TouchableOpacity>
            </View>
          )}
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
            <Section title="Rate This Contractor">
              <Text style={styles.signoffNote}>
                Rate the contractor before submitting — required to release your payment.
              </Text>
              {hasRated ? (
                <View style={styles.ratedRow}>
                  <RatingStars value={pendingStars} size="md" />
                  <Text style={styles.ratedConfirm}>✓ Rating submitted</Text>
                </View>
              ) : (
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <TouchableOpacity key={n} onPress={() => handleRating(n)} style={styles.starBtn}>
                      <Text style={[styles.starGlyph, pendingStars >= n && styles.starGlyphOn]}>★</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </Section>
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

        {/* Rating reminder — after completion, if somehow not yet rated */}
        {isComplete && isMine && !hasRated && (
          <>
            <Divider />
            <Section title="Rate This Contractor">
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map(n => (
                  <TouchableOpacity key={n} onPress={() => handleRating(n)} style={styles.starBtn}>
                    <Text style={[styles.starGlyph, pendingStars >= n && styles.starGlyphOn]}>★</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Section>
          </>
        )}

        {/* Spacer for fixed footer */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Fixed action footer */}
      <View style={styles.footer}>
        {canClaim && (
          <TouchableOpacity style={styles.primaryButton} onPress={handleClaim}>
            <Text style={styles.primaryButtonText}>Review & Claim — {formatCurrency(job.sub_payout)}</Text>
          </TouchableOpacity>
        )}
        {myClaimPending && (
          <View style={styles.pendingBox}>
            <Text style={styles.pendingText}>⏳ Claim requested — waiting for the contractor to accept</Text>
            <Text style={styles.payoutStatusLink}>You'll get a notification the moment they do.</Text>
          </View>
        )}
        {claimPendingOther && (
          <View style={styles.pendingBox}>
            <Text style={styles.pendingText}>Another sub has a claim pending on this job</Text>
          </View>
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
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/(sub)/payout-status/[jobId]', params: { jobId: id } } as any)}
            >
              <Text style={styles.payoutStatusLink}>View payout status →</Text>
            </TouchableOpacity>
          </View>
        )}
        {isMine && (job.status === 'in_progress' || job.status === 'pending_review') && (
          openingDispute ? (
            <View style={styles.disputeForm}>
              <Text style={styles.disputeFormTitle}>Open a Dispute</Text>
              <TextInput
                style={styles.disputeFormInput}
                value={disputeReason}
                onChangeText={setDisputeReason}
                placeholder="What's the issue? — contractor unresponsive, unfair terms, non-payment..."
                placeholderTextColor={colors.textLight}
                multiline
                numberOfLines={3}
                autoFocus
              />
              <View style={styles.footerRow}>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => { setOpeningDispute(false); setDisputeReason(''); }}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.disputeSubmitButton, styles.flex, (!disputeReason.trim() || submittingDispute) && styles.buttonDisabled]}
                  onPress={handleOpenDispute}
                  disabled={submittingDispute || !disputeReason.trim()}
                >
                  {submittingDispute
                    ? <ActivityIndicator color={colors.white} />
                    : <Text style={styles.disputeSubmitText}>Open Dispute</Text>}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.openDisputeButton} onPress={() => setOpeningDispute(true)}>
              <Text style={styles.openDisputeButtonText}>⚠️ Open a Dispute</Text>
            </TouchableOpacity>
          )
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

function materialStatusLabel(status: Job['material_status']) {
  if (status === 'on_site') return '✅ On-site';
  if (status === 'local') return '📍 Local pickup (~25 mi)';
  return '🚚 Distant — delivery applies';
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
  hero: { alignItems: 'center', paddingVertical: spacing.lg },
  payout: { fontSize: 48, fontWeight: '800', color: colors.accent },
  payoutLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  title: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.text },
  location: { fontSize: fontSize.sm, color: colors.textMuted },
  shareBtn: { alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 6, marginTop: spacing.xs },
  shareBtnText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },
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
    padding: spacing.md, alignItems: 'center', gap: spacing.xs,
  },
  pendingText: { fontSize: fontSize.sm, color: '#92400e', fontWeight: '600' },
  payoutStatusLink: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600' },
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
    borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.white,
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
    fontSize: fontSize.xs, fontWeight: '700', color: colors.accent, minWidth: 48,
  },
  msgPreviewBody: {
    flex: 1, fontSize: fontSize.sm, color: colors.text,
  },
  msgPreviewTime: {
    fontSize: fontSize.xs, color: colors.textMuted,
  },
  viewThread: {
    fontSize: fontSize.xs, color: colors.accent, fontWeight: '600',
    marginTop: spacing.xs, textAlign: 'right',
  },
  callLogList: {
    marginTop: spacing.xs, gap: 2,
  },
  callLogRow: {
    fontSize: fontSize.xs, color: colors.textMuted, paddingVertical: 2,
  },
  analyzeButton: {
    borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md,
    padding: spacing.sm, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: spacing.xs,
  },
  analyzeButtonDisabled: { opacity: 0.5 },
  analyzeButtonText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' },
  analysisCard: {
    backgroundColor: '#f0fdf4', borderRadius: radius.md, padding: spacing.md,
    gap: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.accent,
  },
  analysisGreat: { backgroundColor: '#f0fdf4', borderLeftColor: '#16a34a' },
  analysisLow: { backgroundColor: '#fef2f2', borderLeftColor: colors.error },
  analysisHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  analysisBadge: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  analysisDismiss: { fontSize: fontSize.md, color: colors.textMuted, paddingHorizontal: spacing.xs },
  analysisHeadline: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  analysisBullet: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },
  analysisWatchOut: {
    backgroundColor: '#fef3c7', borderRadius: radius.sm, padding: spacing.sm, marginTop: spacing.xs,
  },
  analysisWatchOutText: { fontSize: fontSize.xs, color: '#78350f', fontWeight: '600' },
  disputedBanner: {
    backgroundColor: '#fef2f2', borderRadius: radius.md, padding: spacing.md,
    gap: spacing.xs, borderLeftWidth: 3, borderLeftColor: colors.error,
  },
  disputedTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.error },
  disputedReason: { fontSize: fontSize.sm, color: colors.text, fontStyle: 'italic' },
  disputedNote: { fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 18 },
  evidenceForm: { gap: spacing.sm, marginTop: spacing.sm },
  evidenceThread: { gap: spacing.sm, marginTop: spacing.sm },
  evidenceEmpty: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic', marginTop: spacing.xs },
  evidenceItem: {
    backgroundColor: colors.white, borderRadius: radius.sm, padding: spacing.sm, gap: 4,
    borderWidth: 1, borderColor: colors.border,
  },
  evidenceRole: { fontSize: fontSize.xs, fontWeight: '700', color: colors.primary, textTransform: 'capitalize' },
  evidenceNote: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },
  evidencePhotos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 4 },
  evidencePhoto: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.surface },
  disputeInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.sm, fontSize: fontSize.sm, color: colors.text,
    backgroundColor: colors.white, minHeight: 72, textAlignVertical: 'top',
  },
  disputeSubmitButton: {
    backgroundColor: colors.error, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center',
  },
  disputeSubmitText: { color: colors.white, fontWeight: '700', fontSize: fontSize.sm },
  disputeForm: { gap: spacing.sm },
  disputeFormTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  disputeFormInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.sm, fontSize: fontSize.sm, color: colors.text,
    backgroundColor: colors.surface, minHeight: 72, textAlignVertical: 'top',
  },
  openDisputeButton: {
    borderWidth: 1, borderColor: colors.error, borderRadius: radius.md,
    padding: spacing.sm, alignItems: 'center', marginTop: spacing.sm,
  },
  openDisputeButtonText: { color: colors.error, fontSize: fontSize.sm, fontWeight: '600' },
  qaEmpty: { fontSize: fontSize.sm, color: colors.textMuted, fontStyle: 'italic' },
  qaItem: { backgroundColor: colors.surface, borderRadius: radius.sm, padding: spacing.sm, gap: 4 },
  qaQuestion: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  qaAnswer: { fontSize: fontSize.sm, color: colors.accent, fontWeight: '500' },
  qaPending: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic' },
  qaInputRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' },
  qaInput: { flex: 1 },
  qaSubmitBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  qaSubmitText: { color: colors.white, fontWeight: '700', fontSize: fontSize.sm },
  starsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  starBtn: { padding: 4 },
  starGlyph: { fontSize: 32, color: colors.border },
  starGlyphOn: { color: '#f59e0b' },
  ratedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs },
  ratedConfirm: { fontSize: fontSize.sm, color: colors.accent, fontWeight: '600' },
});
