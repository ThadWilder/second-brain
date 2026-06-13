import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { signOut } from '@/lib/auth';
import RatingStars from '@/components/RatingStars';
import PaymentStatus from '@/components/PaymentStatus';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import type { ContractorProfile } from '@/lib/types';

export default function ContractorProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<ContractorProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchProfile(); }, []);

  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase.from('contractor_profiles').select('*').eq('user_id', user!.id).single();
    setProfile(data);
    setLoading(false);
  }

  if (loading) return <ActivityIndicator style={styles.loader} color={colors.primary} />;
  if (!profile) return <Text style={styles.notFound}>Profile not found.</Text>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.businessName}>{profile.business_name}</Text>
        <Text style={styles.contactName}>{profile.contact_name}</Text>
        <RatingStars value={profile.rating} count={profile.rating_count} size="lg" />
      </View>

      <PaymentStatus connected={!!profile.stripe_customer_id} type="contractor" />
      {!profile.stripe_customer_id && (
        <TouchableOpacity
          style={styles.addPaymentButton}
          onPress={() => router.push('/(contractor)/add-payment')}
        >
          <Text style={styles.addPaymentText}>Add Payment Method →</Text>
        </TouchableOpacity>
      )}

      <Section title="Business Credentials">
        <InfoRow label="License" value={profile.license_number} />
        <InfoRow label="Insurance" value={profile.insurance_number} />
        <InfoRow label="Insurance Expires" value={profile.insurance_expiry} />
      </Section>

      <Section title="Service Area">
        <InfoRow label="Home ZIP" value={profile.service_area_zip} />
        <InfoRow label="Radius" value={`${profile.service_area_miles} miles`} />
      </Section>

      <Section title="Pre-Agreed Fee Schedule">
        <View style={styles.feeCard}>
          <InfoRow label="Change order fee" value={`$${profile.change_order_fee}`} />
          <InfoRow label="Delay pay rate" value={`$${(profile as any).delay_pay_rate_per_hour ?? 35}/hr`} />
          <InfoRow label="Add-on pay rate" value={`$${(profile as any).addon_pay_rate_per_lf ?? 15}/LF`} />
          <InfoRow label="Return trip fee" value={`$${(profile as any).return_trip_fee ?? 150}`} />
          <InfoRow label="Delay liability cap" value={`$${profile.delay_liability_cap}`} />
          <InfoRow label="Payment terms" value={`${profile.payment_terms_days} days`} />
        </View>
        <Text style={styles.feeNote}>
          These rates auto-apply to all change orders. Subs see them before claiming.
        </Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loader: { marginTop: spacing.xxl },
  notFound: { textAlign: 'center', marginTop: spacing.xxl, color: colors.textMuted },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  businessName: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.text },
  contactName: { fontSize: fontSize.md, color: colors.textMuted },
  addPaymentButton: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    padding: spacing.sm, alignItems: 'center', marginTop: -spacing.sm,
  },
  addPaymentText: { color: colors.white, fontWeight: '600', fontSize: fontSize.sm },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  feeCard: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    padding: spacing.md, gap: spacing.xs,
  },
  feeNote: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  label: { fontSize: fontSize.sm, color: colors.textMuted },
  value: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500' },
  signOutButton: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.md },
  signOutText: { color: colors.textMuted, fontWeight: '600' },
});
