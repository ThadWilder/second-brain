import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

export default function OnboardContractorScreen() {
  const router = useRouter();
  const [form, setForm] = useState({
    business_name: '',
    contact_name: '',
    license_number: '',
    insurance_number: '',
    insurance_expiry: '',
    service_area_zip: '',
    service_area_miles: '50',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function set(key: keyof typeof form) {
    return (val: string) => setForm(f => ({ ...f, [key]: val }));
  }

  async function handleSubmit() {
    const required = ['business_name', 'contact_name', 'license_number', 'insurance_number', 'insurance_expiry', 'service_area_zip'] as const;
    for (const field of required) {
      if (!form[field]) { setError(`${field.replace(/_/g, ' ')} is required.`); return; }
    }
    setLoading(true);
    setError('');
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await supabase.from('contractor_profiles').insert({
      user_id: user!.id,
      ...form,
      service_area_miles: parseInt(form.service_area_miles, 10) || 50,
      scope_of_work: ['fencing'],
      change_order_fee: 75,
      delay_liability_cap: 500,
      payment_terms_days: 14,
    });
    if (err) { setError(err.message); setLoading(false); return; }
    router.replace('/(contractor)/');
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Business Profile</Text>
      <Text style={styles.subheading}>
        This information appears on job listings and is verified by SubHub.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Field label="Business Name" value={form.business_name} onChangeText={set('business_name')} />
      <Field label="Your Name" value={form.contact_name} onChangeText={set('contact_name')} />
      <Field label="License Number" value={form.license_number} onChangeText={set('license_number')} />
      <Field label="Insurance Policy Number" value={form.insurance_number} onChangeText={set('insurance_number')} />
      <Field label="Insurance Expiry (MM/YYYY)" value={form.insurance_expiry} onChangeText={set('insurance_expiry')} placeholder="06/2027" keyboardType="numbers-and-punctuation" />
      <Field label="Home Zip Code" value={form.service_area_zip} onChangeText={set('service_area_zip')} keyboardType="number-pad" />
      <Field label="Service Radius (miles)" value={form.service_area_miles} onChangeText={set('service_area_miles')} keyboardType="number-pad" />

      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          By continuing you agree to SubHub's fee schedule: a listing fee applies when a subcontractor
          claims your job, plus a per-job change order fee of $75 and a delay liability cap of $500.
          These are pre-agreed and non-negotiable on site.
        </Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading}>
        {loading
          ? <ActivityIndicator color={colors.white} />
          : <Text style={styles.buttonText}>Create Profile & Start Posting</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType }: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
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
  heading: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.text },
  subheading: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 20 },
  error: {
    color: colors.error, fontSize: fontSize.sm, backgroundColor: '#fef2f2',
    padding: spacing.sm, borderRadius: radius.sm,
  },
  field: { gap: spacing.xs },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, fontSize: fontSize.md, color: colors.text, backgroundColor: colors.surface,
  },
  notice: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    padding: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.primary,
  },
  noticeText: { fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 18 },
  button: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center', marginTop: spacing.sm,
  },
  buttonText: { color: colors.white, fontSize: fontSize.md, fontWeight: '600' },
});
