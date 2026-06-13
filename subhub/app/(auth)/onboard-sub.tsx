import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

export default function OnboardSubScreen() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    license_number: '',
    insurance_number: '',
    insurance_expiry: '',
    tax_id: '',
    service_area_zip: '',
    service_area_miles: '75',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function set(key: keyof typeof form) {
    return (val: string) => setForm(f => ({ ...f, [key]: val }));
  }

  async function handleSubmit() {
    const required = ['name', 'license_number', 'insurance_number', 'insurance_expiry', 'tax_id', 'service_area_zip'] as const;
    for (const field of required) {
      if (!form[field]) { setError(`${field.replace(/_/g, ' ')} is required.`); return; }
    }
    setLoading(true);
    setError('');
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await supabase.from('sub_profiles').insert({
      user_id: user!.id,
      ...form,
      service_area_miles: parseInt(form.service_area_miles, 10) || 75,
      skills: ['fencing'],
      payout_type: 'bank',
      verified: false,
    });
    if (err) { setError(err.message); setLoading(false); return; }
    router.replace('/(sub)/');
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Pro Profile</Text>
      <Text style={styles.subheading}>
        Contractors see this before offering you work. Verified profiles get priority placement.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Field label="Your Full Name" value={form.name} onChangeText={set('name')} />
      <Field label="License Number" value={form.license_number} onChangeText={set('license_number')} />
      <Field label="Insurance Policy Number" value={form.insurance_number} onChangeText={set('insurance_number')} />
      <Field label="Insurance Expiry (MM/YYYY)" value={form.insurance_expiry} onChangeText={set('insurance_expiry')} placeholder="06/2027" keyboardType="numbers-and-punctuation" />
      <Field label="Tax ID / EIN" value={form.tax_id} onChangeText={set('tax_id')} placeholder="XX-XXXXXXX" />
      <Field label="Home Zip Code" value={form.service_area_zip} onChangeText={set('service_area_zip')} keyboardType="number-pad" />
      <Field label="How far will you travel? (miles)" value={form.service_area_miles} onChangeText={set('service_area_miles')} keyboardType="number-pad" />

      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          SubHub takes a percentage of your payout when you get paid. All payments flow through
          the app — no direct cash deals. Off-platform work is a Terms of Service violation.
        </Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading}>
        {loading
          ? <ActivityIndicator color={colors.white} />
          : <Text style={styles.buttonText}>Create Profile & Browse Jobs</Text>}
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
    padding: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.accent,
  },
  noticeText: { fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 18 },
  button: {
    backgroundColor: colors.accent, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center', marginTop: spacing.sm,
  },
  buttonText: { color: colors.white, fontSize: fontSize.md, fontWeight: '600' },
});
