import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { signOut } from '@/lib/auth';
import RatingStars from '@/components/RatingStars';
import PaymentStatus from '@/components/PaymentStatus';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import type { SubProfile } from '@/lib/types';

const SKILLS = ['Fencing', 'Decking', 'Pergola / Shade', 'Gates', 'Retaining Walls', 'General'];

export default function SubProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<SubProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState({
    phone_number: '',
    service_area_zip: '',
    service_area_miles: '',
  });
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  useEffect(() => { fetchProfile(); }, []);

  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase.from('sub_profiles').select('*').eq('user_id', user!.id).single();
    setProfile(data);
    if (data) {
      setFields({
        phone_number: (data as any).phone_number ?? '',
        service_area_zip: data.service_area_zip ?? '',
        service_area_miles: String(data.service_area_miles ?? 75),
      });
      setSelectedSkills(data.skills ?? ['Fencing']);
    }
    setLoading(false);
  }

  function toggleSkill(skill: string) {
    setSelectedSkills(prev =>
      prev.includes(skill) ? (prev.length > 1 ? prev.filter(s => s !== skill) : prev) : [...prev, skill]
    );
  }

  async function save() {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from('sub_profiles')
      .update({
        phone_number: fields.phone_number || null,
        service_area_zip: fields.service_area_zip,
        service_area_miles: parseInt(fields.service_area_miles, 10) || 75,
        skills: selectedSkills,
      })
      .eq('id', profile.id);
    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setEditing(false);
      fetchProfile();
    }
  }

  if (loading) return <ActivityIndicator style={styles.loader} color={colors.accent} />;
  if (!profile) return <Text style={styles.notFound}>Profile not found.</Text>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>{profile.name.charAt(0)}</Text>
        </View>
        <Text style={styles.name}>{profile.name}</Text>
        <RatingStars value={profile.rating} count={profile.rating_count} size="lg" />
        {profile.verified && (
          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedText}>✓ Verified</Text>
          </View>
        )}
      </View>

      <PaymentStatus connected={!!profile.stripe_account_id} type="sub" />
      {!profile.stripe_account_id && (
        <TouchableOpacity
          style={styles.connectButton}
          onPress={() => router.push('/(sub)/connect-stripe')}
        >
          <Text style={styles.connectText}>Connect Bank Account →</Text>
        </TouchableOpacity>
      )}

      <Section title="Credentials">
        <InfoRow label="License" value={profile.license_number} />
        <InfoRow label="Insurance" value={profile.insurance_number} />
        <InfoRow label="Insurance Expires" value={profile.insurance_expiry} />
        <InfoRow label="Tax ID / EIN" value={profile.tax_id} />
      </Section>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Service Area & Skills</Text>
        {!editing ? (
          <TouchableOpacity onPress={() => setEditing(true)}>
            <Text style={styles.editLink}>Edit</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => setEditing(false)}>
            <Text style={styles.cancelLink}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>

      {!editing ? (
        <View style={styles.infoCard}>
          <InfoRow label="Home ZIP" value={profile.service_area_zip} />
          <InfoRow label="Travel Radius" value={`${profile.service_area_miles} miles`} />
          <InfoRow label="Skills" value={profile.skills.join(', ')} />
          {(profile as any).phone_number && (
            <InfoRow label="Phone" value={(profile as any).phone_number} />
          )}
        </View>
      ) : (
        <View style={styles.editCard}>
          <EditField label="Home ZIP" value={fields.service_area_zip} onChangeText={v => setFields(f => ({ ...f, service_area_zip: v }))} keyboardType="number-pad" />
          <EditField label="Travel radius (miles)" value={fields.service_area_miles} onChangeText={v => setFields(f => ({ ...f, service_area_miles: v }))} keyboardType="number-pad" />
          <EditField label="Mobile phone" value={fields.phone_number} onChangeText={v => setFields(f => ({ ...f, phone_number: v }))} keyboardType="phone-pad" placeholder="+1 (555) 000-0000" />
          <Text style={styles.editLabel}>Skills / trades</Text>
          <View style={styles.chipGrid}>
            {SKILLS.map(skill => {
              const sel = selectedSkills.includes(skill);
              return (
                <TouchableOpacity
                  key={skill}
                  style={[styles.chip, sel && styles.chipSelected]}
                  onPress={() => toggleSkill(skill)}
                >
                  <Text style={[styles.chipText, sel && styles.chipTextSelected]}>{skill}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity style={styles.saveButton} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
          </TouchableOpacity>
        </View>
      )}

      <Section title="Payout">
        <InfoRow label="Method" value={profile.payout_type === 'instant' ? '⚡ Instant Pay' : '🏦 Bank Transfer'} />
        <InfoRow label="Account" value={profile.stripe_account_id ? 'Connected ✓' : 'Not connected'} />
      </Section>

      <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function EditField({ label, value, onChangeText, keyboardType, placeholder }: {
  label: string; value: string; onChangeText: (v: string) => void;
  keyboardType?: any; placeholder?: string;
}) {
  return (
    <View style={styles.editFieldRow}>
      <Text style={styles.editLabel}>{label}</Text>
      <TextInput
        style={styles.editInput}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder ?? label}
        placeholderTextColor={colors.textLight}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loader: { marginTop: spacing.xxl },
  notFound: { textAlign: 'center', marginTop: spacing.xxl, color: colors.textMuted },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 32, fontWeight: '700', color: colors.white },
  name: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.text },
  verifiedBadge: { backgroundColor: colors.accentLight, paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: 999 },
  verifiedText: { fontSize: fontSize.sm, color: colors.accent, fontWeight: '700' },
  connectButton: {
    backgroundColor: colors.accent, borderRadius: radius.md,
    padding: spacing.sm, alignItems: 'center', marginTop: -spacing.sm,
  },
  connectText: { color: colors.white, fontWeight: '600', fontSize: fontSize.sm },
  section: { gap: spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  editLink: { fontSize: fontSize.sm, color: colors.accent, fontWeight: '600' },
  cancelLink: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '600' },
  infoCard: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  editCard: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  label: { fontSize: fontSize.sm, color: colors.textMuted },
  value: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500' },
  editFieldRow: { gap: spacing.xs },
  editLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  editInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: spacing.sm, fontSize: fontSize.sm, color: colors.text,
    backgroundColor: colors.background,
  },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '500' },
  chipTextSelected: { color: colors.white },
  saveButton: { backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center', marginTop: spacing.xs },
  saveButtonText: { color: colors.white, fontWeight: '700', fontSize: fontSize.sm },
  signOutButton: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.md },
  signOutText: { color: colors.textMuted, fontWeight: '600' },
});
