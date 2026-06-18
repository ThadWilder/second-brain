import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { signOut } from '@/lib/auth';
import { claimReferral } from '@/lib/referrals';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

const SKILLS = ['Fencing', 'Decking', 'Pergola / Shade', 'Gates', 'Retaining Walls', 'General'];

export default function OnboardSubScreen() {
  const router = useRouter();
  const { ref } = useLocalSearchParams<{ ref?: string }>();
  const [form, setForm] = useState({
    name: '',
    license_number: '',
    insurance_number: '',
    insurance_expiry: '',
    tax_id: '',
    service_area_zip: '',
    service_area_miles: '75',
    phone_number: '',
    bio: '',
  });
  const [selectedSkills, setSelectedSkills] = useState<string[]>(['Fencing']);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function toggleSkill(skill: string) {
    setSelectedSkills(prev =>
      prev.includes(skill) ? (prev.length > 1 ? prev.filter(s => s !== skill) : prev) : [...prev, skill]
    );
  }

  function set(key: keyof typeof form) {
    return (val: string) => setForm(f => ({ ...f, [key]: val }));
  }

  async function handleSubmit() {
    const required = ['name', 'license_number', 'insurance_number', 'insurance_expiry', 'tax_id', 'service_area_zip'] as const;
    for (const field of required) {
      if (!form[field]) { setError(`${field.replace(/_/g, ' ')} is required.`); return; }
    }
    if (!termsAgreed) { setError('You must agree to the platform terms to continue.'); return; }
    setLoading(true);
    setError('');
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) { setError('Session expired. Please sign in again.'); setLoading(false); return; }
    const { error: err } = await supabase.from('sub_profiles').insert({
      user_id: user.id,
      name: form.name,
      license_number: form.license_number,
      insurance_number: form.insurance_number,
      insurance_expiry: form.insurance_expiry,
      tax_id: form.tax_id,
      service_area_zip: form.service_area_zip,
      service_area_miles: parseInt(form.service_area_miles, 10) || 75,
      phone_number: form.phone_number || null,
      bio: form.bio || null,
      skills: selectedSkills,
      payout_type: 'bank',
      verified: false,
    });
    if (err) { setError(err.message); setLoading(false); return; }
    // Growth hooks: grant a new-user visibility boost and record any referral.
    supabase.rpc('grant_new_user_boost', { p_user: user.id }).then(() => {});
    if (ref) claimReferral(String(ref)).catch(() => {});
    router.replace('/(sub)/home' as any);
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
      <Field label="Mobile Phone (for SubHub calls)" value={form.phone_number} onChangeText={set('phone_number')} keyboardType="phone-pad" placeholder="+1 (555) 000-0000" />

      <View style={styles.field}>
        <Text style={styles.label}>About you (optional)</Text>
        <TextInput
          style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
          value={form.bio}
          onChangeText={set('bio')}
          placeholder="Briefly describe your experience, specialties, and work style..."
          placeholderTextColor={colors.textLight}
          multiline
          numberOfLines={3}
        />
      </View>

      <Text style={styles.label}>Your skills / trades</Text>
      <View style={styles.chipGrid}>
        {SKILLS.map(skill => {
          const selected = selectedSkills.includes(skill);
          return (
            <TouchableOpacity
              key={skill}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => toggleSkill(skill)}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{skill}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>How SubHub works</Text>
        <Text style={styles.noticeText}>
          SubHub takes a percentage of your payout when you get paid. The payout is locked when you
          claim the job — no negotiation on site. All payments flow through the app. Contractors can't
          pay you directly, and you can't request off-platform payment.
        </Text>
        <Text style={[styles.noticeText, { marginTop: spacing.xs }]}>
          All communication with contractors happens through SubHub. Sharing contact info or taking
          work directly is a Terms of Service violation and results in account suspension.
        </Text>
      </View>

      <TouchableOpacity style={styles.agreeBox} onPress={() => setTermsAgreed(v => !v)} activeOpacity={0.85}>
        <View style={[styles.checkbox, termsAgreed && styles.checkboxOn]}>
          {termsAgreed && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.agreeText}>
          I understand SubHub takes a platform fee from my payout. I will not accept or solicit
          off-platform payments. All communication with contractors happens through SubHub.
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, !termsAgreed && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={loading || !termsAgreed}
      >
        {loading
          ? <ActivityIndicator color={colors.white} />
          : <Text style={styles.buttonText}>Create Profile & Browse Jobs</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
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
  subheading: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 22 },
  error: { color: colors.error, fontSize: fontSize.sm, backgroundColor: '#fef2f2', padding: spacing.sm, borderRadius: radius.sm },
  field: { gap: spacing.xs },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: fontSize.md, color: colors.text, backgroundColor: colors.surface },
  notice: { backgroundColor: colors.accentLight, borderRadius: radius.md, padding: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.accent, gap: spacing.xs },
  noticeTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.accent },
  noticeText: { fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 18 },
  agreeBox: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, backgroundColor: '#fef3c7', borderRadius: radius.md, padding: spacing.md, borderLeftWidth: 4, borderLeftColor: colors.warning },
  agreeText: { flex: 1, fontSize: fontSize.sm, color: '#78350f', lineHeight: 22 },
  checkbox: { width: 24, height: 24, borderRadius: 5, borderWidth: 2, borderColor: colors.warning, alignItems: 'center', justifyContent: 'center', marginTop: 2, flexShrink: 0, backgroundColor: colors.white },
  checkboxOn: { backgroundColor: colors.warning, borderColor: colors.warning },
  checkmark: { color: colors.white, fontSize: 14, fontWeight: '800' },
  button: { backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  buttonText: { color: colors.white, fontSize: fontSize.md, fontWeight: '600' },
  buttonDisabled: { opacity: 0.4 },
  signOutButton: { alignItems: 'center', paddingVertical: spacing.sm },
  signOutText: { fontSize: fontSize.sm, color: colors.textMuted },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '500' },
  chipTextSelected: { color: colors.white },
});
