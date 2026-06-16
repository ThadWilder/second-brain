import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

const PAYMENT_TERMS = [
  { label: '10 days', value: '10' },
  { label: '14 days', value: '14' },
];

const INDUSTRIES = ['Fencing', 'Decking', 'Pergola / Shade', 'Gates', 'Retaining Walls', 'General'];

export default function OnboardContractorScreen() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [feeAgreed, setFeeAgreed] = useState(false);
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>(['Fencing']);

  const [form, setForm] = useState({
    business_name: '',
    contact_name: '',
    phone_number: '',
    license_number: '',
    insurance_number: '',
    insurance_expiry: '',
    service_area_zip: '',
    service_area_miles: '50',
    delay_pay_rate_per_hour: '35',
    addon_pay_rate_per_lf: '15',
    return_trip_fee: '150',
    change_order_fee: '75',
    delay_liability_cap: '500',
    payment_terms_days: '14',
  });

  function toggleIndustry(ind: string) {
    setSelectedIndustries(prev =>
      prev.includes(ind) ? (prev.length > 1 ? prev.filter(i => i !== ind) : prev) : [...prev, ind]
    );
  }

  function set(key: keyof typeof form) {
    return (val: string) => setForm(f => ({ ...f, [key]: val }));
  }

  function validateStep1() {
    const required = ['business_name', 'contact_name', 'license_number', 'insurance_number', 'insurance_expiry', 'service_area_zip'] as const;
    for (const field of required) {
      if (!form[field]) { setError(`${field.replace(/_/g, ' ')} is required.`); return false; }
    }
    setError('');
    return true;
  }

  async function handleSubmit() {
    if (!feeAgreed) { setError('You must agree to the fee schedule to continue.'); return; }
    setLoading(true);
    setError('');
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) { setError('Session expired. Please sign in again.'); setLoading(false); return; }
    const { error: err } = await supabase.from('contractor_profiles').insert({
      user_id: user.id,
      business_name: form.business_name,
      contact_name: form.contact_name,
      license_number: form.license_number,
      insurance_number: form.insurance_number,
      insurance_expiry: form.insurance_expiry,
      service_area_zip: form.service_area_zip,
      service_area_miles: parseInt(form.service_area_miles, 10) || 50,
      scope_of_work: selectedIndustries,
      phone_number: form.phone_number || null,
      delay_pay_rate_per_hour: parseFloat(form.delay_pay_rate_per_hour) || 35,
      addon_pay_rate_per_lf: parseFloat(form.addon_pay_rate_per_lf) || 15,
      return_trip_fee: parseFloat(form.return_trip_fee) || 150,
      change_order_fee: parseFloat(form.change_order_fee) || 75,
      delay_liability_cap: parseFloat(form.delay_liability_cap) || 500,
      payment_terms_days: parseInt(form.payment_terms_days, 10) || 14,
    });
    if (err) { setError(err.message); setLoading(false); return; }
    router.replace('/(contractor)/');
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <StepIndicator current={step} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {step === 1 && (
        <>
          <Text style={styles.heading}>Business Profile</Text>
          <Text style={styles.subheading}>
            This information appears on job listings and is verified by SubHub.
          </Text>

          <Field label="Business Name" value={form.business_name} onChangeText={set('business_name')} />
          <Field label="Your Name" value={form.contact_name} onChangeText={set('contact_name')} />
          <Field label="Mobile Phone (for SubHub calls)" value={form.phone_number} onChangeText={set('phone_number')} keyboardType="phone-pad" placeholder="+1 (555) 000-0000" />
          <Field label="License Number" value={form.license_number} onChangeText={set('license_number')} />
          <Field label="Insurance Policy Number" value={form.insurance_number} onChangeText={set('insurance_number')} />
          <Field label="Insurance Expiry (MM/YYYY)" value={form.insurance_expiry} onChangeText={set('insurance_expiry')} placeholder="06/2027" keyboardType="numbers-and-punctuation" />
          <Field label="Home Zip Code" value={form.service_area_zip} onChangeText={set('service_area_zip')} keyboardType="number-pad" />
          <Field label="Service Radius (miles)" value={form.service_area_miles} onChangeText={set('service_area_miles')} keyboardType="number-pad" />

          <Text style={styles.label}>Industries you work in</Text>
          <View style={styles.chipGrid}>
            {INDUSTRIES.map(ind => {
              const selected = selectedIndustries.includes(ind);
              return (
                <TouchableOpacity
                  key={ind}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => toggleIndustry(ind)}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{ind}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={styles.button} onPress={() => { if (validateStep1()) setStep(2); }}>
            <Text style={styles.buttonText}>Next: Fee Schedule →</Text>
          </TouchableOpacity>
        </>
      )}

      {step === 2 && (
        <>
          <Text style={styles.heading}>Your Fee Schedule</Text>
          <Text style={styles.subheading}>
            These rates auto-apply to every change order on your jobs. Subs see them before claiming. No negotiation on site.
          </Text>

          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Why this matters</Text>
            <Text style={styles.noticeText}>
              Every change on your jobs — delays, add-ons, return trips — is handled through SubHub at these
              pre-set rates. No phone calls, no arguments. The sub sees exactly what they'll earn before they
              file. You see exactly what it costs. Job moves forward.
            </Text>
          </View>

          <Field label="Delay pay ($ per hour)" value={form.delay_pay_rate_per_hour} onChangeText={set('delay_pay_rate_per_hour')} keyboardType="decimal-pad" placeholder="35" />
          <Field label="Add-on pay ($ per linear foot)" value={form.addon_pay_rate_per_lf} onChangeText={set('addon_pay_rate_per_lf')} keyboardType="decimal-pad" placeholder="15" />
          <Field label="Return trip fee ($)" value={form.return_trip_fee} onChangeText={set('return_trip_fee')} keyboardType="decimal-pad" placeholder="150" />
          <Field label="Change order admin fee ($)" value={form.change_order_fee} onChangeText={set('change_order_fee')} keyboardType="decimal-pad" placeholder="75" />
          <Field label="Max delay liability ($)" value={form.delay_liability_cap} onChangeText={set('delay_liability_cap')} keyboardType="decimal-pad" placeholder="500" />

          <Text style={styles.label}>Payment terms (days to collect from homeowner)</Text>
          <View style={styles.pillRow}>
            {PAYMENT_TERMS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.pill, form.payment_terms_days === opt.value && styles.pillSelected]}
                onPress={() => setForm(f => ({ ...f, payment_terms_days: opt.value }))}
              >
                <Text style={[styles.pillText, form.payment_terms_days === opt.value && styles.pillTextSelected]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.feeBox} onPress={() => setFeeAgreed(v => !v)} activeOpacity={0.85}>
            <View style={[styles.checkbox, feeAgreed && styles.checkboxOn]}>
              {feeAgreed && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.feeText}>
              I agree to this fee schedule. These rates are non-negotiable on site and will auto-apply to
              all change orders on my jobs. Subcontractors will see these rates before claiming any job I post.
            </Text>
          </TouchableOpacity>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.backButton} onPress={() => setStep(1)}>
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.flex, !feeAgreed && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading || !feeAgreed}
            >
              {loading
                ? <ActivityIndicator color={colors.white} />
                : <Text style={styles.buttonText}>Create Profile & Start Posting</Text>}
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function StepIndicator({ current }: { current: number }) {
  return (
    <View style={styles.steps}>
      {['Credentials', 'Fee Schedule'].map((label, i) => (
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

function Field({ label, value, onChangeText, placeholder, keyboardType }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; keyboardType?: any;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor={colors.textLight}
        keyboardType={keyboardType}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  steps: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xxl, marginBottom: spacing.md },
  stepItem: { alignItems: 'center', gap: 4 },
  stepDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stepDotActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  stepDotDone: { borderColor: colors.accent, backgroundColor: colors.accent },
  stepNum: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textMuted },
  stepNumActive: { color: colors.white },
  stepLabel: { fontSize: fontSize.xs, color: colors.textMuted },
  stepLabelActive: { color: colors.primary, fontWeight: '600' },
  heading: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.text },
  subheading: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 22 },
  error: { color: colors.error, fontSize: fontSize.sm, backgroundColor: '#fef2f2', padding: spacing.sm, borderRadius: radius.sm },
  notice: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.primary, gap: spacing.xs },
  noticeTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },
  noticeText: { fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 18 },
  field: { gap: spacing.xs },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: fontSize.md, color: colors.text, backgroundColor: colors.surface },
  pillRow: { flexDirection: 'row', gap: spacing.sm },
  pill: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  pillSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '500' },
  pillTextSelected: { color: colors.white },
  feeBox: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, backgroundColor: '#fef3c7', borderRadius: radius.md, padding: spacing.md, borderLeftWidth: 4, borderLeftColor: colors.warning },
  feeText: { flex: 1, fontSize: fontSize.sm, color: '#78350f', lineHeight: 22 },
  checkbox: { width: 24, height: 24, borderRadius: 5, borderWidth: 2, borderColor: colors.warning, alignItems: 'center', justifyContent: 'center', marginTop: 2, flexShrink: 0, backgroundColor: colors.white },
  checkboxOn: { backgroundColor: colors.warning, borderColor: colors.warning },
  checkmark: { color: colors.white, fontSize: 14, fontWeight: '800' },
  button: { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  buttonText: { color: colors.white, fontSize: fontSize.md, fontWeight: '600' },
  buttonRow: { flexDirection: 'row', gap: spacing.sm },
  backButton: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  backButtonText: { color: colors.text, fontSize: fontSize.md },
  flex: { flex: 1 },
  buttonDisabled: { opacity: 0.4 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '500' },
  chipTextSelected: { color: colors.white },
});
