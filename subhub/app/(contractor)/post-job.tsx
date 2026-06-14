import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import type { MaterialStatus } from '@/lib/types';

const MATERIAL_OPTIONS: { label: string; value: MaterialStatus; desc: string }[] = [
  { label: 'On-site', value: 'on_site', desc: 'Material is already at the job site' },
  { label: 'Local pickup', value: 'local', desc: 'Within ~25 miles of job site' },
  { label: 'Distant', value: 'distant', desc: 'Outside local radius — delivery required' },
];

export default function PostJobScreen() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    title: '',
    industry: 'Fencing',
    scope_of_work: '',
    material_supplier: '',
    material_supplier_address: '',
    material_status: 'on_site' as MaterialStatus,
    address: '',
    city: '',
    state: '',
    zip: '',
    estimated_days: '1',
    start_window_start: '',
    start_window_end: '',
    install_price: '',
    sub_payout: '',
    homeowner_name: '',
    homeowner_phone: '',
    homeowner_email: '',
  });

  function set(key: keyof typeof form) {
    return (val: string) => setForm(f => ({ ...f, [key]: val }));
  }

  function validateStep() {
    if (step === 1) {
      if (!form.title || !form.scope_of_work || !form.material_supplier) {
        setError('Fill in all scope fields.'); return false;
      }
    }
    if (step === 2) {
      if (!form.address || !form.city || !form.state || !form.zip || !form.sub_payout || !form.estimated_days) {
        setError('Fill in all logistics fields.'); return false;
      }
    }
    setError('');
    return true;
  }

  async function handleSubmit() {
    if (!form.homeowner_name || !form.homeowner_phone) {
      setError('Homeowner name and phone are required.'); return;
    }
    const subPayout = parseFloat(form.sub_payout);
    const installPrice = parseFloat(form.install_price);
    if (isNaN(subPayout) || subPayout <= 0) {
      setError('Sub payout is required. Go back to Logistics and enter a dollar amount.'); return;
    }
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) { setError('Session expired. Please sign in again.'); setLoading(false); return; }
    const { error: err } = await supabase.from('jobs').insert({
      contractor_id: user.id,
      ...form,
      estimated_days: parseInt(form.estimated_days, 10),
      install_price: isNaN(installPrice) ? null : installPrice,
      sub_payout: subPayout,
      status: 'posted',
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    Alert.alert('Job Posted!', 'Subcontractors in your area can now see and claim this job.', [
      { text: 'View My Jobs', onPress: () => router.replace('/(contractor)/') },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <StepIndicator current={step} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {step === 1 && (
        <>
          <Section title="Scope & Materials">
            <Field label="Job Title" value={form.title} onChangeText={set('title')} placeholder="e.g. 6ft Cedar Privacy Fence — 150 LF" />
            <Field label="Scope of Work" value={form.scope_of_work} onChangeText={set('scope_of_work')} placeholder="Describe exactly what needs to be installed..." multiline />
            <Field label="Material Supplier" value={form.material_supplier} onChangeText={set('material_supplier')} placeholder="e.g. Home Depot, Sherwood Lumber" />
            <Field label="Supplier Address" value={form.material_supplier_address} onChangeText={set('material_supplier_address')} placeholder="123 Main St, City, ST" />
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
          </Section>
          <TouchableOpacity style={styles.button} onPress={() => { if (validateStep()) setStep(2); }}>
            <Text style={styles.buttonText}>Next: Logistics →</Text>
          </TouchableOpacity>
        </>
      )}

      {step === 2 && (
        <>
          <Section title="Job Logistics">
            <Field label="Street Address" value={form.address} onChangeText={set('address')} />
            <View style={styles.row}>
              <View style={styles.flex}><Field label="City" value={form.city} onChangeText={set('city')} /></View>
              <View style={styles.w80}><Field label="State" value={form.state} onChangeText={set('state')} placeholder="TX" /></View>
              <View style={styles.w80}><Field label="ZIP" value={form.zip} onChangeText={set('zip')} keyboardType="number-pad" /></View>
            </View>
            <Field label="Estimated Days to Complete" value={form.estimated_days} onChangeText={set('estimated_days')} keyboardType="number-pad" />
            <Field label="Start Window — Earliest Date" value={form.start_window_start} onChangeText={set('start_window_start')} placeholder="MM/DD/YYYY" />
            <Field label="Start Window — Latest Date" value={form.start_window_end} onChangeText={set('start_window_end')} placeholder="MM/DD/YYYY" />
            <Field label="Total Install Price ($)" value={form.install_price} onChangeText={set('install_price')} keyboardType="decimal-pad" placeholder="0.00" />
            <Field label="Sub Payout ($)" value={form.sub_payout} onChangeText={set('sub_payout')} keyboardType="decimal-pad" placeholder="0.00" />
          </Section>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.backButton} onPress={() => setStep(1)}>
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.flex]} onPress={() => { if (validateStep()) setStep(3); }}>
              <Text style={styles.buttonText}>Next: Closeout →</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {step === 3 && (
        <>
          <Section title="Homeowner & Closeout">
            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                Homeowner contact info is masked in the app. Subcontractors communicate through SubHub only.
              </Text>
            </View>
            <Field label="Homeowner Name" value={form.homeowner_name} onChangeText={set('homeowner_name')} />
            <Field label="Homeowner Phone" value={form.homeowner_phone} onChangeText={set('homeowner_phone')} keyboardType="phone-pad" />
            <Field label="Homeowner Email" value={form.homeowner_email} onChangeText={set('homeowner_email')} keyboardType="email-address" />
          </Section>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.backButton} onPress={() => setStep(2)}>
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.flex]} onPress={handleSubmit} disabled={loading}>
              {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Post Job</Text>}
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
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
      {['Scope', 'Logistics', 'Closeout'].map((label, i) => (
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
});
