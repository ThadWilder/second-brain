import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { notify } from '@/lib/notifications';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import type { ChangeOrderType, MaterialStatus, ContractorProfile, Job } from '@/lib/types';

const TYPES: { label: string; value: ChangeOrderType; desc: string }[] = [
  { label: 'Layout Change', value: 'layout', desc: 'Site layout or fence line changed' },
  { label: 'Material Change', value: 'material', desc: 'Different or additional material needed' },
  { label: 'Add-On', value: 'addon', desc: 'Additional scope beyond original job' },
  { label: 'Scope Change', value: 'scope', desc: 'Overall job scope has shifted' },
];

const MATERIAL_STATUS: { label: string; value: MaterialStatus }[] = [
  { label: 'On-site', value: 'on_site' },
  { label: 'Local pickup (~25 mi)', value: 'local' },
  { label: 'Distant — delivery needed', value: 'distant' },
];

export default function ContractorChangeOrderScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [profile, setProfile] = useState<ContractorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [type, setType] = useState<ChangeOrderType>('layout');
  const [materialStatus, setMaterialStatus] = useState<MaterialStatus>('on_site');
  const [description, setDescription] = useState('');
  const [delayHours, setDelayHours] = useState('0');
  const [addonQty, setAddonQty] = useState('0');
  const [needsReturnTrip, setNeedsReturnTrip] = useState(false);

  useEffect(() => {
    fetchData();
  }, [jobId]);

  async function fetchData() {
    const { data: { user } } = await supabase.auth.getUser();
    const [{ data: j }, { data: p }] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', jobId).single(),
      supabase.from('contractor_profiles').select('*').eq('user_id', user!.id).single(),
    ]);
    setJob(j);
    setProfile(p);
    setLoading(false);
  }

  const delayPay = profile ? parseFloat(delayHours) * profile.delay_pay_rate_per_hour : 0;
  const addonPay = profile ? parseFloat(addonQty) * profile.addon_pay_rate_per_lf : 0;
  const returnTripPay = needsReturnTrip && profile ? profile.return_trip_fee : 0;
  const total = delayPay + addonPay + returnTripPay;

  async function handleSubmit() {
    if (!description.trim()) { setError('Describe the change.'); return; }
    setSubmitting(true);
    setError('');

    const { error: err } = await supabase.from('change_orders').insert({
      job_id: jobId,
      initiated_by: (await supabase.auth.getUser()).data.user!.id,
      type,
      material_status: materialStatus,
      description: description.trim(),
      delay_pay: delayPay,
      addon_pay: addonPay,
      return_trip_pay: returnTripPay,
      contractor_approved: true, // contractor auto-approves their own submission
      sub_approved: false,
      status: 'open',
    });

    if (err) { setError(err.message); setSubmitting(false); return; }

    if (job?.claimed_by) {
      await notify.changeOrderFiled(job.claimed_by, job.title, jobId);
    }

    setSubmitting(false);
    Alert.alert('Change Order Filed', 'The subcontractor will be notified to review and approve.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  }

  if (loading) return <ActivityIndicator style={styles.loader} color={colors.primary} />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>File Change Order</Text>
      {job && <Text style={styles.jobTitle}>{job.title}</Text>}

      {profile && (
        <View style={styles.rateCard}>
          <Text style={styles.rateTitle}>Pre-agreed rates (no negotiation on site)</Text>
          <View style={styles.rates}>
            <Rate label="Delay pay" value={`$${profile.delay_pay_rate_per_hour}/hr`} />
            <Rate label="Add-on" value={`$${profile.addon_pay_rate_per_lf}/LF`} />
            <Rate label="Return trip" value={`$${profile.return_trip_fee}`} />
            <Rate label="Change order fee" value={`$${profile.change_order_fee}`} />
          </View>
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.label}>Type of Change</Text>
      {TYPES.map(t => (
        <TouchableOpacity
          key={t.value}
          style={[styles.option, type === t.value && styles.optionSelected]}
          onPress={() => setType(t.value)}
        >
          <Text style={[styles.optionLabel, type === t.value && styles.optionLabelSelected]}>{t.label}</Text>
          <Text style={styles.optionDesc}>{t.desc}</Text>
        </TouchableOpacity>
      ))}

      <Text style={styles.label}>Material Location</Text>
      <View style={styles.pillRow}>
        {MATERIAL_STATUS.map(m => (
          <TouchableOpacity
            key={m.value}
            style={[styles.pill, materialStatus === m.value && styles.pillSelected]}
            onPress={() => setMaterialStatus(m.value)}
          >
            <Text style={[styles.pillText, materialStatus === m.value && styles.pillTextSelected]}>
              {m.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Description of Change</Text>
      <TextInput
        style={styles.textArea}
        value={description}
        onChangeText={setDescription}
        placeholder="Describe exactly what changed and why..."
        placeholderTextColor={colors.textLight}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />

      <Text style={styles.sectionTitle}>Pay Adjustments</Text>

      <NumericField
        label={`Delay hours${profile ? ` ($${profile.delay_pay_rate_per_hour}/hr)` : ''}`}
        value={delayHours}
        onChangeText={setDelayHours}
      />
      <NumericField
        label={`Add-on linear feet${profile ? ` ($${profile.addon_pay_rate_per_lf}/LF)` : ''}`}
        value={addonQty}
        onChangeText={setAddonQty}
      />

      <TouchableOpacity
        style={[styles.checkRow, needsReturnTrip && styles.checkRowSelected]}
        onPress={() => setNeedsReturnTrip(v => !v)}
      >
        <View style={[styles.checkbox, needsReturnTrip && styles.checkboxChecked]}>
          {needsReturnTrip && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.checkLabel}>
          Return trip required{profile ? ` (+$${profile.return_trip_fee})` : ''}
        </Text>
      </TouchableOpacity>

      {total > 0 && (
        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>Total pay adjustment</Text>
          <Text style={styles.totalAmount}>+${total.toFixed(2)}</Text>
        </View>
      )}

      <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={submitting}>
        {submitting
          ? <ActivityIndicator color={colors.white} />
          : <Text style={styles.buttonText}>File Change Order</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

function Rate({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.rateRow}>
      <Text style={styles.rateLabel}>{label}</Text>
      <Text style={styles.rateValue}>{value}</Text>
    </View>
  );
}

function NumericField({ label, value, onChangeText }: { label: string; value: string; onChangeText: (v: string) => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.numericInput}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholderTextColor={colors.textLight}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loader: { marginTop: spacing.xxl },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  heading: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.text },
  jobTitle: { fontSize: fontSize.md, color: colors.textMuted },
  rateCard: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    padding: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.primary,
  },
  rateTitle: { fontSize: fontSize.xs, fontWeight: '700', color: colors.primary, marginBottom: spacing.sm, textTransform: 'uppercase' },
  rates: { gap: spacing.xs },
  rateRow: { flexDirection: 'row', justifyContent: 'space-between' },
  rateLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  rateValue: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600' },
  error: { color: colors.error, backgroundColor: '#fef2f2', padding: spacing.sm, borderRadius: radius.sm, fontSize: fontSize.sm },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  option: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  optionSelected: { borderColor: colors.primary, backgroundColor: '#eff6ff' },
  optionLabel: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  optionLabelSelected: { color: colors.primary },
  optionDesc: { fontSize: fontSize.xs, color: colors.textMuted },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pill: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  pillSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '500' },
  pillTextSelected: { color: colors.white },
  textArea: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, fontSize: fontSize.md, color: colors.text,
    backgroundColor: colors.surface, height: 100,
  },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  field: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fieldLabel: { flex: 1, fontSize: fontSize.sm, color: colors.text },
  numericInput: {
    width: 80, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: spacing.sm, fontSize: fontSize.md, color: colors.text, textAlign: 'right',
    backgroundColor: colors.surface,
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md },
  checkRowSelected: { backgroundColor: colors.accentLight },
  checkbox: {
    width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkmark: { color: colors.white, fontWeight: '800', fontSize: 13 },
  checkLabel: { fontSize: fontSize.sm, color: colors.text, flex: 1 },
  totalBox: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.accentLight, borderRadius: radius.md, padding: spacing.md,
  },
  totalLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  totalAmount: { fontSize: fontSize.xl, fontWeight: '800', color: colors.accent },
  button: { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  buttonText: { color: colors.white, fontSize: fontSize.md, fontWeight: '700' },
});
