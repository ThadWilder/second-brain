import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import { CREW_PRIORITY_HOURS } from '@/lib/crew';
import { getMyFeeStatus, feeWaiverMessage, type FeeStatus } from '@/lib/fees';
import type { MaterialStatus } from '@/lib/types';

const INDUSTRIES = ['Fencing', 'Decking', 'Pergola / Shade', 'Gates', 'Retaining Walls', 'General'];

const MATERIAL_OPTIONS: { label: string; value: MaterialStatus; desc: string }[] = [
  { label: 'On-site', value: 'on_site', desc: 'Material is already at the job site' },
  { label: 'Local pickup', value: 'local', desc: 'Within ~25 miles of job site' },
  { label: 'Distant', value: 'distant', desc: 'Outside local radius — delivery required' },
];

const STEPS = ['Basics', 'Scope', 'Materials', 'Payout', 'Review'];

export default function PostJobScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId?: string }>();
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [loading, setLoading] = useState(false);
  const [hasPaymentMethod, setHasPaymentMethod] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [feeAgreed, setFeeAgreed] = useState(false);
  const [crewCount, setCrewCount] = useState(0);
  const [crewPriority, setCrewPriority] = useState(true);
  const [feeStatus, setFeeStatus] = useState<FeeStatus | null>(null);
  const [crewMatch, setCrewMatch] = useState<{ score: number; reason: string } | null>(null);

  const [form, setForm] = useState({
    title: '',
    industry: 'Fencing',
    scope_of_work: '',
    estimated_days: '1',
    start_window_start: '',
    start_window_end: '',
    material_supplier: '',
    material_supplier_address: '',
    material_status: 'on_site' as MaterialStatus,
    address: '',
    city: '',
    state: '',
    zip: '',
    install_price: '',
    sub_payout: '',
    homeowner_name: '',
    homeowner_phone: '',
    homeowner_email: '',
  });

  useFocusEffect(
    useCallback(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) return;
        supabase
          .from('contractor_profiles')
          .select('stripe_customer_id')
          .eq('user_id', session.user.id)
          .single()
          .then(({ data }) => {
            setHasPaymentMethod(!!data?.stripe_customer_id);
          });
        supabase
          .from('crew_members')
          .select('id', { count: 'exact', head: true })
          .eq('contractor_id', session.user.id)
          .eq('status', 'active')
          .then(({ count }) => setCrewCount(count ?? 0));
      });
      getMyFeeStatus().then(setFeeStatus).catch(() => {});
    }, [])
  );

  // Lightweight AI-style match: score this job against the contractor's recent
  // posting pattern (trade, payout range, duration). High match → crew priority
  // defaults on with the reasoning shown; low match → defaults off.
  async function scoreCrewMatch() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: recent } = await supabase
      .from('jobs')
      .select('industry, sub_payout, estimated_days')
      .eq('contractor_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (!recent || recent.length < 3) {
      setCrewMatch({ score: 60, reason: 'Not enough history yet — defaulting on for your crew.' });
      setCrewPriority(true);
      return;
    }
    const payout = parseFloat(form.sub_payout) || 0;
    const days = parseInt(form.estimated_days, 10) || 1;
    const sameTrade = recent.filter(r => r.industry === form.industry);
    const tradeShare = sameTrade.length / recent.length;
    const base = sameTrade.length ? sameTrade : recent;
    const avgPay = base.reduce((s, r) => s + (r.sub_payout || 0), 0) / base.length;
    const avgDays = base.reduce((s, r) => s + (r.estimated_days || 1), 0) / base.length;
    const payClose = avgPay > 0 ? Math.max(0, 1 - Math.abs(payout - avgPay) / avgPay) : 0.5;
    const daysClose = avgDays > 0 ? Math.max(0, 1 - Math.abs(days - avgDays) / avgDays) : 0.5;
    const score = Math.round((tradeShare * 0.5 + payClose * 0.3 + daysClose * 0.2) * 100);
    const reason = score >= 60
      ? `Matches your typical ${form.industry} work (~$${Math.round(avgPay).toLocaleString()}, ${Math.round(avgDays)}d).`
      : `Differs from your usual pattern — review before giving crew first shot.`;
    setCrewMatch({ score, reason });
    setCrewPriority(score >= 60);
  }

  function set(key: keyof typeof form) {
    return (val: string) => setForm(f => ({ ...f, [key]: val }));
  }

  function validateStep(): boolean {
    if (step === 1) {
      if (!form.title) { setError('Job title is required.'); return false; }
    }
    if (step === 2) {
      if (!form.scope_of_work || !form.estimated_days) {
        setError('Scope of work and estimated days are required.'); return false;
      }
    }
    if (step === 3) {
      if (!form.material_supplier) { setError('Material supplier is required.'); return false; }
    }
    if (step === 4) {
      if (!form.address || !form.city || !form.state || !form.zip || !form.sub_payout) {
        setError('All location and payout fields are required.'); return false;
      }
      const sp = parseFloat(form.sub_payout);
      if (isNaN(sp) || sp <= 0) { setError('Sub payout must be a dollar amount greater than zero.'); return false; }
    }
    setError('');
    return true;
  }

  function next() {
    if (!validateStep()) return;
    if (step === 4 && crewCount > 0) scoreCrewMatch();
    setStep(s => (s + 1) as any);
  }
  function back() { setError(''); setStep(s => (s - 1) as any); }

  async function handleSubmit() {
    if (!form.homeowner_name || !form.homeowner_phone) {
      setError('Homeowner name and phone are required.'); return;
    }
    if (!feeAgreed) { setError('You must acknowledge the platform fee to post.'); return; }
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) { setError('Session expired. Please sign in again.'); setLoading(false); return; }
    const subPayout = parseFloat(form.sub_payout);
    const installPrice = parseFloat(form.install_price);

    const { data: newJob, error: err } = await supabase.from('jobs').insert({
      contractor_id: user.id,
      title: form.title,
      industry: form.industry,
      scope_of_work: form.scope_of_work,
      estimated_days: parseInt(form.estimated_days, 10),
      start_window_start: form.start_window_start || null,
      start_window_end: form.start_window_end || null,
      material_supplier: form.material_supplier,
      material_supplier_address: form.material_supplier_address,
      material_status: form.material_status,
      address: form.address,
      city: form.city,
      state: form.state,
      zip: form.zip,
      install_price: isNaN(installPrice) ? null : installPrice,
      sub_payout: subPayout,
      homeowner_name: form.homeowner_name,
      homeowner_phone: form.homeowner_phone,
      homeowner_email: form.homeowner_email,
      status: 'posted',
      project_id: projectId ?? null,
      crew_priority_until: (crewCount > 0 && crewPriority)
        ? new Date(Date.now() + CREW_PRIORITY_HOURS * 3600 * 1000).toISOString()
        : null,
    }).select('id').single();

    if (err || !newJob) { setError(err?.message ?? 'Failed to post job.'); setLoading(false); return; }

    // Place $1,000 authorization hold on contractor's card
    const { data: holdData, error: holdErr } = await supabase.functions.invoke('hold-payment', {
      body: { jobId: newJob.id },
    });

    if (holdErr || holdData?.error) {
      await supabase.from('jobs').delete().eq('id', newJob.id);
      setError(holdData?.error ?? holdErr?.message ?? 'Card authorization failed. Check your payment method and try again.');
      setLoading(false);
      return;
    }

    // Consume one fee-free post if the contractor still has waivers left.
    if (feeStatus && feeStatus.role === 'contractor' && feeStatus.freeRemaining > 0) {
      supabase.from('contractor_profiles')
        .update({ free_posts_remaining: feeStatus.freeRemaining - 1 })
        .eq('user_id', user.id).then(() => {});
    }

    // Notify subs whose saved-search alerts match this job (best-effort)
    supabase.functions.invoke('match-saved-searches', { body: { jobId: newJob.id } }).catch(() => {});

    setLoading(false);
    Alert.alert('Job Posted!', 'A $1,000 hold has been placed on your card. Subs can now claim this job — the hold is released when the job is cancelled or replaced by full payment.', [
      { text: 'View My Jobs', onPress: () => router.replace('/(contractor)/') },
    ]);
  }

  if (hasPaymentMethod === false) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.paymentGate}>
          <Text style={styles.paymentGateTitle}>Payment Method Required</Text>
          <Text style={styles.paymentGateBody}>
            You need to add a payment method before you can post jobs.
            SubHub holds payment in escrow when a sub claims your job.
          </Text>
          <TouchableOpacity style={styles.button} onPress={() => router.navigate('/(contractor)/profile')}>
            <Text style={styles.buttonText}>Add Payment Method →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <StepIndicator current={step} />

      {projectId ? (
        <View style={styles.projectTag}>
          <Text style={styles.projectTagText}>📋 Adding this job to a project</Text>
        </View>
      ) : null}

      {feeStatus && feeStatus.role === 'contractor' && feeStatus.freeRemaining > 0 && step === 1 ? (
        <View style={styles.waiverBanner}>
          <Text style={styles.waiverText}>{feeWaiverMessage(feeStatus)}</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* ── Step 1: Basics ── */}
      {step === 1 && (
        <>
          <Section title="Job Basics">
            <Field label="Job Title" value={form.title} onChangeText={set('title')} placeholder="e.g. 6ft Cedar Privacy Fence — 150 LF" />
            <Text style={styles.label}>Industry</Text>
            <View style={styles.industryGrid}>
              {INDUSTRIES.map(ind => (
                <TouchableOpacity
                  key={ind}
                  style={[styles.industryChip, form.industry === ind && styles.industryChipSelected]}
                  onPress={() => setForm(f => ({ ...f, industry: ind }))}
                >
                  <Text style={[styles.industryChipText, form.industry === ind && styles.industryChipTextSelected]}>
                    {ind}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Section>
          <TouchableOpacity style={styles.button} onPress={next}>
            <Text style={styles.buttonText}>Next: Scope →</Text>
          </TouchableOpacity>
        </>
      )}

      {/* ── Step 2: Scope ── */}
      {step === 2 && (
        <>
          <Section title="Scope of Work">
            <Field
              label="Describe the job in full"
              value={form.scope_of_work}
              onChangeText={set('scope_of_work')}
              placeholder="Describe exactly what needs to be installed. Be specific — a sub should be able to say yes without calling you."
              multiline
            />
            <Field label="Estimated Days to Complete" value={form.estimated_days} onChangeText={set('estimated_days')} keyboardType="number-pad" />
            <Field label="Earliest Start Date" value={form.start_window_start} onChangeText={set('start_window_start')} placeholder="MM/DD/YYYY" />
            <Field label="Latest Start Date" value={form.start_window_end} onChangeText={set('start_window_end')} placeholder="MM/DD/YYYY" />
          </Section>
          <NavRow onBack={back} onNext={next} nextLabel="Next: Materials →" />
        </>
      )}

      {/* ── Step 3: Materials ── */}
      {step === 3 && (
        <>
          <Section title="Materials">
            <Text style={styles.label}>Material Status</Text>
            <View style={styles.optionGroup}>
              {MATERIAL_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.option, form.material_status === opt.value && styles.optionSelected]}
                  onPress={() => setForm(f => ({ ...f, material_status: opt.value }))}
                >
                  <Text style={[styles.optionLabel, form.material_status === opt.value && styles.optionLabelSelected]}>
                    {opt.label}
                  </Text>
                  <Text style={styles.optionDesc}>{opt.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Field label="Material Supplier" value={form.material_supplier} onChangeText={set('material_supplier')} placeholder="e.g. Home Depot, Sherwood Lumber" />
            <Field label="Supplier Address" value={form.material_supplier_address} onChangeText={set('material_supplier_address')} placeholder="123 Main St, City, ST" />
          </Section>
          <NavRow onBack={back} onNext={next} nextLabel="Next: Payout →" />
        </>
      )}

      {/* ── Step 4: Payout & Location ── */}
      {step === 4 && (
        <>
          <Section title="Payout & Location">
            <Field label="Street Address" value={form.address} onChangeText={set('address')} />
            <View style={styles.row}>
              <View style={styles.flex}><Field label="City" value={form.city} onChangeText={set('city')} /></View>
              <View style={styles.w80}><Field label="State" value={form.state} onChangeText={set('state')} placeholder="TX" /></View>
              <View style={styles.w80}><Field label="ZIP" value={form.zip} onChangeText={set('zip')} keyboardType="number-pad" /></View>
            </View>
            <Field label="Total Install Price ($)" value={form.install_price} onChangeText={set('install_price')} keyboardType="decimal-pad" placeholder="0.00" />
            <View style={styles.payoutBox}>
              <Field label="Sub Payout ($)" value={form.sub_payout} onChangeText={set('sub_payout')} keyboardType="decimal-pad" placeholder="0.00" />
              <Text style={styles.payoutNote}>
                This is what the sub earns. The platform fee is deducted from this amount before release.
              </Text>
            </View>
            <LFBenchmark industry={form.industry} payout={form.sub_payout} />
          </Section>
          <NavRow onBack={back} onNext={next} nextLabel="Next: Review →" />
        </>
      )}

      {/* ── Step 5: Review & Homeowner ── */}
      {step === 5 && (
        <>
          <View style={styles.reviewCard}>
            <Text style={styles.reviewTitle}>{form.title || 'Untitled Job'}</Text>
            <Text style={styles.reviewLocation}>{[form.city, form.state].filter(Boolean).join(', ')}</Text>
            <View style={styles.reviewChips}>
              {form.sub_payout ? <Chip>${parseFloat(form.sub_payout).toFixed(0)} payout</Chip> : null}
              {form.estimated_days ? <Chip>{form.estimated_days} day{form.estimated_days !== '1' ? 's' : ''}</Chip> : null}
              <Chip>{form.industry}</Chip>
              <Chip>{MATERIAL_OPTIONS.find(m => m.value === form.material_status)?.label ?? ''}</Chip>
            </View>
          </View>

          <Section title="Homeowner Contact">
            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                Homeowner contact info is masked in the app. Subcontractors communicate through SubHub only.
              </Text>
            </View>
            <Field label="Homeowner Name" value={form.homeowner_name} onChangeText={set('homeowner_name')} />
            <Field label="Homeowner Phone" value={form.homeowner_phone} onChangeText={set('homeowner_phone')} keyboardType="phone-pad" />
            <Field label="Homeowner Email" value={form.homeowner_email} onChangeText={set('homeowner_email')} keyboardType="email-address" />
          </Section>

          {crewCount > 0 && (
            <TouchableOpacity style={styles.crewBox} onPress={() => setCrewPriority(v => !v)} activeOpacity={0.85}>
              <View style={[styles.toggle, crewPriority && styles.toggleOn]}>
                <View style={[styles.toggleKnob, crewPriority && styles.toggleKnobOn]} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.crewTitle}>⚡ Give your Crew first shot</Text>
                <Text style={styles.crewDesc}>
                  This job stays exclusive to your {crewCount} crew member{crewCount === 1 ? '' : 's'} for {CREW_PRIORITY_HOURS} hours
                  before it opens to the full job board.
                </Text>
                {crewMatch && (
                  <Text style={[styles.matchNote, crewMatch.score >= 60 ? styles.matchHigh : styles.matchLow]}>
                    {crewMatch.score >= 60 ? '🟢' : '🟡'} {crewMatch.score}% match · {crewMatch.reason}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.feeBox} onPress={() => setFeeAgreed(v => !v)} activeOpacity={0.85}>
            <View style={[styles.checkbox, feeAgreed && styles.checkboxOn]}>
              {feeAgreed && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.feeText}>
              I understand that SubHub charges a platform fee on this job. The fee covers payment
              processing, escrow, dispute resolution, and platform maintenance. The fee is deducted
              from the sub payout before release — no additional charge to me.
            </Text>
          </TouchableOpacity>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.backButton} onPress={back}>
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.flex, !feeAgreed && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading || !feeAgreed}
            >
              {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Post Job</Text>}
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function NavRow({ onBack, onNext, nextLabel }: { onBack: () => void; onNext: () => void; nextLabel: string }) {
  return (
    <View style={styles.buttonRow}>
      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.flex]} onPress={onNext}>
        <Text style={styles.buttonText}>{nextLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{children}</Text>
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

function StepIndicator({ current }: { current: number }) {
  return (
    <View style={styles.steps}>
      {STEPS.map((label, i) => (
        <View key={label} style={styles.stepItem}>
          <View style={[styles.stepDot, current === i + 1 && styles.stepDotActive, current > i + 1 && styles.stepDotDone]}>
            <Text style={[styles.stepNum, (current === i + 1 || current > i + 1) && styles.stepNumActive]}>
              {current > i + 1 ? '✓' : i + 1}
            </Text>
          </View>
          <Text style={[styles.stepLabel, current === i + 1 && styles.stepLabelActive]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType, multiline }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; keyboardType?: any; multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor={colors.textLight}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

const LF_BENCHMARKS: Record<string, { min: number; max: number; unit: string; note: string }> = {
  'Fencing':         { min: 8,   max: 18,  unit: 'LF',   note: '6ft cedar/vinyl privacy fence' },
  'Decking':         { min: 12,  max: 22,  unit: 'SF',   note: 'Pressure-treated or composite' },
  'Pergola / Shade': { min: 15,  max: 35,  unit: 'LF',   note: 'Freestanding or attached' },
  'Gates':           { min: 250, max: 700, unit: 'unit',  note: 'Per gate, swing or sliding' },
  'Retaining Walls': { min: 20,  max: 50,  unit: 'LF',   note: 'Block or timber wall' },
  'General':         { min: 10,  max: 25,  unit: 'LF',   note: 'Varies by scope' },
};

function LFBenchmark({ industry, payout }: { industry: string; payout: string }) {
  const bm = LF_BENCHMARKS[industry];
  if (!bm) return null;
  const p = parseFloat(payout);
  const midpoint = (bm.min + bm.max) / 2;
  const rating = !isNaN(p) && p > 0
    ? p / 100 >= bm.max ? 'high' : p / 100 >= midpoint ? 'fair' : 'low'
    : null;

  return (
    <View style={styles.benchmarkCard}>
      <Text style={styles.benchmarkTitle}>Market average · {industry}</Text>
      <Text style={styles.benchmarkRange}>
        ${bm.min}–${bm.max} / {bm.unit} <Text style={styles.benchmarkNote}>({bm.note})</Text>
      </Text>
      {rating && (
        <Text style={[
          styles.benchmarkRating,
          rating === 'high' && styles.ratingHigh,
          rating === 'fair' && styles.ratingFair,
          rating === 'low' && styles.ratingLow,
        ]}>
          {rating === 'high' ? '🟢 Above market — strong offer' : rating === 'fair' ? '🟡 Near market rate' : '🔴 Below market — may attract fewer bids'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  steps: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, marginBottom: spacing.sm },
  stepItem: { alignItems: 'center', gap: 4 },
  stepDot: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepDotActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  stepDotDone: { borderColor: colors.accent, backgroundColor: colors.accent },
  stepNum: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textMuted },
  stepNumActive: { color: colors.white },
  stepLabel: { fontSize: fontSize.xs, color: colors.textMuted },
  stepLabelActive: { color: colors.primary, fontWeight: '600' },
  error: {
    color: colors.error, fontSize: fontSize.sm, backgroundColor: '#fef2f2',
    padding: spacing.sm, borderRadius: radius.sm,
  },
  section: { gap: spacing.md },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  field: { gap: spacing.xs },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, fontSize: fontSize.md, color: colors.text, backgroundColor: colors.surface,
  },
  inputMultiline: { height: 100 },
  industryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  industryChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  industryChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  industryChipText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '500' },
  industryChipTextSelected: { color: colors.white },
  payoutBox: { gap: spacing.xs },
  payoutNote: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic' },
  reviewCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  reviewTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  reviewLocation: { fontSize: fontSize.sm, color: colors.textMuted },
  reviewChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  chip: { backgroundColor: colors.surfaceAlt, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  chipText: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  w80: { width: 80 },
  optionGroup: { gap: spacing.sm },
  option: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, gap: 2,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: '#eff6ff' },
  optionLabel: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  optionLabelSelected: { color: colors.primary },
  optionDesc: { fontSize: fontSize.xs, color: colors.textMuted },
  notice: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    padding: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.primary,
  },
  noticeText: { fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 18 },
  button: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center',
  },
  buttonText: { color: colors.white, fontSize: fontSize.md, fontWeight: '600' },
  buttonRow: { flexDirection: 'row', gap: spacing.sm },
  backButton: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  backButtonText: { color: colors.text, fontSize: fontSize.md },
  feeBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md,
    backgroundColor: '#fef3c7', borderRadius: radius.md,
    padding: spacing.md, borderLeftWidth: 4, borderLeftColor: colors.warning,
  },
  feeText: { flex: 1, fontSize: fontSize.md, color: '#78350f', lineHeight: 26 },
  checkbox: {
    width: 28, height: 28, borderRadius: 6, borderWidth: 2,
    borderColor: colors.warning, alignItems: 'center', justifyContent: 'center',
    marginTop: 2, flexShrink: 0, backgroundColor: colors.white,
  },
  checkboxOn: { backgroundColor: colors.warning, borderColor: colors.warning },
  checkmark: { color: colors.white, fontSize: 16, fontWeight: '800' },
  buttonDisabled: { opacity: 0.4 },
  crewBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: '#eff6ff', borderRadius: radius.md,
    padding: spacing.md, borderLeftWidth: 4, borderLeftColor: colors.primary,
  },
  crewTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.primary },
  crewDesc: { fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 18, marginTop: 2 },
  matchNote: { fontSize: fontSize.xs, fontWeight: '600', marginTop: 4 },
  matchHigh: { color: '#15803d' },
  matchLow: { color: '#92400e' },
  projectTag: { backgroundColor: '#eff6ff', borderRadius: radius.md, padding: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.primary },
  projectTagText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },
  waiverBanner: { backgroundColor: colors.accentLight, borderRadius: radius.md, padding: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.accent },
  waiverText: { fontSize: fontSize.sm, color: '#166534', fontWeight: '600' },
  toggle: {
    width: 48, height: 28, borderRadius: 14, backgroundColor: colors.border,
    padding: 3, justifyContent: 'center', flexShrink: 0,
  },
  toggleOn: { backgroundColor: colors.primary },
  toggleKnob: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white,
  },
  toggleKnobOn: { alignSelf: 'flex-end' },
  paymentGate: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    gap: spacing.lg, padding: spacing.xl, marginTop: spacing.xxl,
  },
  paymentGateTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text, textAlign: 'center' },
  paymentGateBody: {
    fontSize: fontSize.md, color: colors.textMuted, textAlign: 'center', lineHeight: 24,
  },
  benchmarkCard: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    padding: spacing.md, gap: spacing.xs, borderLeftWidth: 3, borderLeftColor: colors.primary,
  },
  benchmarkTitle: { fontSize: fontSize.xs, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.3 },
  benchmarkRange: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  benchmarkNote: { fontSize: fontSize.sm, fontWeight: '400', color: colors.textMuted },
  benchmarkRating: { fontSize: fontSize.sm, fontWeight: '600' },
  ratingHigh: { color: '#15803d' },
  ratingFair: { color: '#92400e' },
  ratingLow: { color: colors.error },
});
