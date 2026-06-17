import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Image, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { supabase } from '@/lib/supabase';
import { signOut } from '@/lib/auth';
import RatingStars from '@/components/RatingStars';
import PaymentStatus from '@/components/PaymentStatus';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import { tierMeta, profileCompletion, scoreColor } from '@/lib/reputation';
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
    payout_type: 'bank' as 'bank' | 'instant',
    bio: '',
    availability: 'available' as 'available' | 'busy',
  });
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [portfolioPhotos, setPortfolioPhotos] = useState<Array<{ id: string; url: string; caption: string | null }>>([]);
  const [uploadingPortfolio, setUploadingPortfolio] = useState(false);

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
        payout_type: data.payout_type ?? 'bank',
        bio: (data as any).bio ?? '',
        availability: (data as any).availability ?? 'available',
      });
      setSelectedSkills(data.skills ?? ['Fencing']);
      const { data: photos } = await supabase
        .from('portfolio_photos')
        .select('id, url, caption')
        .eq('sub_id', data.id)
        .order('created_at', { ascending: false });
      setPortfolioPhotos(photos ?? []);
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
        payout_type: fields.payout_type,
        bio: fields.bio || null,
        availability: fields.availability,
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

  async function toggleAvailability() {
    if (!profile) return;
    const next = (profile as any).availability === 'available' ? 'busy' : 'available';
    const { error } = await supabase
      .from('sub_profiles')
      .update({ availability: next })
      .eq('id', profile.id);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setFields(f => ({ ...f, availability: next }));
      fetchProfile();
    }
  }

  async function addPortfolioPhoto() {
    if (!profile) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled) return;
    setUploadingPortfolio(true);
    try {
      const asset = result.assets[0];
      const { data: { user } } = await supabase.auth.getUser();
      const ext = asset.uri.split('.').pop() ?? 'jpg';
      const path = `portfolio/${user!.id}/${Date.now()}.${ext}`;
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const { error: uploadError } = await supabase.storage
        .from('job-media')
        .upload(path, decodeBase64(base64), { contentType: `image/${ext}` });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('job-media').getPublicUrl(path);
      const { data: photo, error: dbError } = await supabase
        .from('portfolio_photos')
        .insert({ sub_id: profile.id, url: publicUrl })
        .select()
        .single();
      if (dbError) throw dbError;
      setPortfolioPhotos(prev => [photo, ...prev]);
    } catch (err) {
      Alert.alert('Upload failed', (err as Error).message);
    } finally {
      setUploadingPortfolio(false);
    }
  }

  async function deletePortfolioPhoto(id: string, url: string) {
    Alert.alert('Remove Photo', 'Delete this portfolio photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const match = url.match(/job-media\/(.+)$/);
          if (match) await supabase.storage.from('job-media').remove([match[1]]);
          await supabase.from('portfolio_photos').delete().eq('id', id);
          setPortfolioPhotos(prev => prev.filter(p => p.id !== id));
        },
      },
    ]);
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
        {(profile as any).jobs_completed > 0 && (
          <Text style={styles.jobsCompleted}>{(profile as any).jobs_completed} jobs completed</Text>
        )}
        {profile.verified && (
          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedText}>✓ Verified</Text>
          </View>
        )}

        <View
          style={[
            styles.tierBadge,
            { backgroundColor: tierMeta((profile as any).tier).color + '20' },
          ]}
        >
          <Text style={[styles.tierBadgeText, { color: tierMeta((profile as any).tier).color }]}>
            {tierMeta((profile as any).tier).emoji} {tierMeta((profile as any).tier).label}
          </Text>
        </View>

        {(profile as any).job_success_score != null ? (
          <View style={styles.jssRow}>
            <Text style={[styles.jssNumber, { color: scoreColor((profile as any).job_success_score) }]}>
              {(profile as any).job_success_score}
            </Text>
            <Text style={styles.jssLabel}>Job Success</Text>
          </View>
        ) : (
          <Text style={styles.jssMuted}>Job Success Score available after 3 completed jobs</Text>
        )}

        <TouchableOpacity
          onPress={toggleAvailability}
          style={[
            styles.availabilityBadge,
            (profile as any).availability === 'busy' ? styles.availabilityBadgeBusy : styles.availabilityBadgeAvailable,
          ]}
        >
          <Text
            style={[
              styles.availabilityBadgeText,
              (profile as any).availability === 'busy' ? styles.availabilityBadgeTextBusy : styles.availabilityBadgeTextAvailable,
            ]}
          >
            {(profile as any).availability === 'busy' ? '⏸️ Not available' : '🟢 Available for work'}
          </Text>
        </TouchableOpacity>
      </View>

      {(() => {
        const completion = profileCompletion(profile);
        if (completion.percent === 100) return null;
        return (
          <View style={styles.completionCard}>
            <Text style={styles.completionHeader}>Profile {completion.percent}% complete</Text>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${completion.percent}%`,
                    backgroundColor: completion.percent === 100 ? colors.accent : colors.primary,
                  },
                ]}
              />
            </View>
            {completion.missing.slice(0, 3).map(item => (
              <Text key={item} style={styles.completionHint}>• {item}</Text>
            ))}
          </View>
        );
      })()}

      <PaymentStatus connected={!!profile.stripe_account_id} type="sub" />
      {!profile.stripe_account_id && (
        <TouchableOpacity
          style={styles.connectButton}
          onPress={() => router.push('/(sub)/connect-stripe')}
        >
          <Text style={styles.connectText}>Connect Bank Account →</Text>
        </TouchableOpacity>
      )}

      {profile && (profile as any).bio && (
        <Section title="About">
          <Text style={styles.bioText}>{(profile as any).bio}</Text>
        </Section>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Portfolio</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.portfolioScroll}>
          <View style={styles.portfolioRow}>
            {portfolioPhotos.map(photo => (
              <TouchableOpacity
                key={photo.id}
                onLongPress={() => deletePortfolioPhoto(photo.id, photo.url)}
                activeOpacity={0.85}
              >
                <Image source={{ uri: photo.url }} style={styles.portfolioThumb} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.portfolioAddBtn}
              onPress={addPortfolioPhoto}
              disabled={uploadingPortfolio}
            >
              {uploadingPortfolio
                ? <ActivityIndicator color={colors.accent} />
                : <Text style={styles.portfolioAddIcon}>+</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
        {portfolioPhotos.length === 0 && !uploadingPortfolio && (
          <Text style={styles.portfolioHint}>Add photos of your completed work to stand out on the job board.</Text>
        )}
        {portfolioPhotos.length > 0 && (
          <Text style={styles.portfolioTip}>Long press a photo to remove it.</Text>
        )}
      </View>

      {((profile as any).avg_response_minutes != null || (profile as any).response_rate != null) && (
        <Section title="Reputation">
          {(profile as any).avg_response_minutes != null && (
            <InfoRow label="Responds within" value={`~${formatResponseTime((profile as any).avg_response_minutes)}`} />
          )}
          {(profile as any).response_rate != null && (
            <InfoRow label="Response rate" value={`${(profile as any).response_rate}%`} />
          )}
        </Section>
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
          <View style={styles.editFieldRow}>
            <Text style={styles.editLabel}>About you</Text>
            <TextInput
              style={[styles.editInput, { height: 80, textAlignVertical: 'top' }]}
              value={fields.bio}
              onChangeText={v => setFields(f => ({ ...f, bio: v }))}
              placeholder="Briefly describe your experience and specialties..."
              placeholderTextColor={colors.textLight}
              multiline
              numberOfLines={3}
            />
          </View>
          {profile?.stripe_account_id && (
            <View style={styles.payoutToggleSection}>
              <Text style={styles.editLabel}>Payout speed</Text>
              <View style={styles.payoutToggleRow}>
                <TouchableOpacity
                  style={[styles.payoutOption, fields.payout_type === 'bank' && styles.payoutOptionActive]}
                  onPress={() => setFields(f => ({ ...f, payout_type: 'bank' }))}
                >
                  <Text style={[styles.payoutOptionText, fields.payout_type === 'bank' && styles.payoutOptionTextActive]}>🏦 Bank Transfer</Text>
                  <Text style={styles.payoutOptionSub}>1–2 business days</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.payoutOption, fields.payout_type === 'instant' && styles.payoutOptionActive]}
                  onPress={() => setFields(f => ({ ...f, payout_type: 'instant' }))}
                >
                  <Text style={[styles.payoutOptionText, fields.payout_type === 'instant' && styles.payoutOptionTextActive]}>⚡ Instant Pay</Text>
                  <Text style={styles.payoutOptionSub}>~1.5% fee, same day</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          <View style={styles.payoutToggleSection}>
            <Text style={styles.editLabel}>Availability</Text>
            <View style={styles.payoutToggleRow}>
              <TouchableOpacity
                style={[styles.payoutOption, fields.availability === 'available' && styles.payoutOptionActive]}
                onPress={() => setFields(f => ({ ...f, availability: 'available' }))}
              >
                <Text style={[styles.payoutOptionText, fields.availability === 'available' && styles.payoutOptionTextActive]}>🟢 Available for work</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.payoutOption, fields.availability === 'busy' && styles.payoutOptionActive]}
                onPress={() => setFields(f => ({ ...f, availability: 'busy' }))}
              >
                <Text style={[styles.payoutOptionText, fields.availability === 'busy' && styles.payoutOptionTextActive]}>⏸️ Not available</Text>
              </TouchableOpacity>
            </View>
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

function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function formatResponseTime(minutes: number): string {
  if (minutes >= 60) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes)}m`;
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
  payoutToggleSection: { gap: spacing.sm },
  payoutToggleRow: { flexDirection: 'row', gap: spacing.sm },
  payoutOption: {
    flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: spacing.sm, gap: 2, backgroundColor: colors.background,
  },
  payoutOptionActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  payoutOptionText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted },
  payoutOptionTextActive: { color: colors.accent },
  payoutOptionSub: { fontSize: 10, color: colors.textMuted },
  signOutButton: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.md },
  signOutText: { color: colors.textMuted, fontWeight: '600' },
  jobsCompleted: { fontSize: fontSize.sm, color: colors.textMuted },
  bioText: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },
  tierBadge: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: 999 },
  tierBadgeText: { fontSize: fontSize.sm, fontWeight: '700' },
  jssRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  jssNumber: { fontSize: fontSize.xxl, fontWeight: '800' },
  jssLabel: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '600' },
  jssMuted: { fontSize: fontSize.xs, color: colors.textLight, textAlign: 'center' },
  availabilityBadge: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  availabilityBadgeAvailable: { backgroundColor: colors.accentLight, borderColor: colors.accent },
  availabilityBadgeBusy: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
  availabilityBadgeText: { fontSize: fontSize.sm, fontWeight: '700' },
  availabilityBadgeTextAvailable: { color: colors.accent },
  availabilityBadgeTextBusy: { color: colors.textMuted },
  completionCard: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  completionHeader: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  progressTrack: { height: 8, borderRadius: 999, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 999 },
  completionHint: { fontSize: fontSize.sm, color: colors.textMuted },
  portfolioScroll: { marginHorizontal: -spacing.xl },
  portfolioRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.xs },
  portfolioThumb: { width: 88, height: 88, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  portfolioAddBtn: {
    width: 88, height: 88, borderRadius: radius.sm,
    borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  portfolioAddIcon: { fontSize: 28, color: colors.textLight },
  portfolioHint: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic' },
  portfolioTip: { fontSize: fontSize.xs, color: colors.textLight },
});
