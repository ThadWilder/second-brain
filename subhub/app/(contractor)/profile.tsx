import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { signOut } from '@/lib/auth';
import RatingStars from '@/components/RatingStars';
import PaymentStatus from '@/components/PaymentStatus';
import ReferralCard from '@/components/ReferralCard';
import SubscriptionTierCard from '@/components/SubscriptionTierCard';
import RecommendedTools from '@/components/RecommendedTools';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import type { ContractorProfile } from '@/lib/types';

export default function ContractorProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<ContractorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingRates, setEditingRates] = useState(false);
  const [savingRates, setSavingRates] = useState(false);
  const [rates, setRates] = useState({
    delay_pay_rate_per_hour: '',
    addon_pay_rate_per_lf: '',
    return_trip_fee: '',
    change_order_fee: '',
    delay_liability_cap: '',
    payment_terms_days: '',
  });

  useEffect(() => { fetchProfile(); }, []);

  async function fetchProfile() {
    const { data: { session } } = await supabase.auth.getSession();
    const { data } = await supabase.from('contractor_profiles').select('*').eq('user_id', session!.user.id).single();
    setProfile(data);
    if (data) {
      setRates({
        delay_pay_rate_per_hour: String((data as any).delay_pay_rate_per_hour ?? 35),
        addon_pay_rate_per_lf: String((data as any).addon_pay_rate_per_lf ?? 15),
        return_trip_fee: String((data as any).return_trip_fee ?? 150),
        change_order_fee: String(data.change_order_fee ?? 75),
        delay_liability_cap: String(data.delay_liability_cap ?? 500),
        payment_terms_days: String(data.payment_terms_days ?? 14),
      });
    }
    setLoading(false);
  }

  async function saveRates() {
    if (!profile) return;
    setSavingRates(true);
    const { error } = await supabase
      .from('contractor_profiles')
      .update({
        delay_pay_rate_per_hour: parseFloat(rates.delay_pay_rate_per_hour) || 35,
        addon_pay_rate_per_lf: parseFloat(rates.addon_pay_rate_per_lf) || 15,
        return_trip_fee: parseFloat(rates.return_trip_fee) || 150,
        change_order_fee: parseFloat(rates.change_order_fee) || 75,
        delay_liability_cap: parseFloat(rates.delay_liability_cap) || 500,
        payment_terms_days: parseInt(rates.payment_terms_days, 10) || 14,
      })
      .eq('id', profile.id);
    setSavingRates(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setEditingRates(false);
      fetchProfile();
    }
  }

  if (loading) return <ActivityIndicator style={styles.loader} color={colors.primary} />;
  if (!profile) return <Text style={styles.notFound}>Profile not found.</Text>;

  const p = profile as any;

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

      <SubscriptionTierCard />
      <ReferralCard />
      <RecommendedTools audience="contractor" />

      <Section title="Business Credentials">
        <InfoRow label="License" value={profile.license_number} />
        <InfoRow label="Insurance" value={profile.insurance_number} />
        <InfoRow label="Insurance Expires" value={profile.insurance_expiry} />
      </Section>

      <Section title="Service Area">
        <InfoRow label="Home ZIP" value={profile.service_area_zip} />
        <InfoRow label="Radius" value={`${profile.service_area_miles} miles`} />
      </Section>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Pre-Agreed Fee Schedule</Text>
        {!editingRates ? (
          <TouchableOpacity onPress={() => setEditingRates(true)}>
            <Text style={styles.editLink}>Edit</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => setEditingRates(false)}>
            <Text style={styles.cancelLink}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>

      {!editingRates ? (
        <>
          <View style={styles.feeCard}>
            <InfoRow label="Delay pay" value={`$${p.delay_pay_rate_per_hour ?? 35}/hr`} />
            <InfoRow label="Add-on pay" value={`$${p.addon_pay_rate_per_lf ?? 15}/LF`} />
            <InfoRow label="Return trip fee" value={`$${p.return_trip_fee ?? 150}`} />
            <InfoRow label="Change order fee" value={`$${profile.change_order_fee}`} />
            <InfoRow label="Delay liability cap" value={`$${profile.delay_liability_cap}`} />
            <InfoRow label="Payment terms" value={`${profile.payment_terms_days} days`} />
          </View>
          <Text style={styles.feeNote}>
            These rates auto-apply to all change orders. Subs see them before claiming any job you post.
          </Text>
        </>
      ) : (
        <View style={styles.feeEditCard}>
          <RateField label="Delay pay ($/hr)" value={rates.delay_pay_rate_per_hour} onChangeText={v => setRates(r => ({ ...r, delay_pay_rate_per_hour: v }))} />
          <RateField label="Add-on pay ($/linear foot)" value={rates.addon_pay_rate_per_lf} onChangeText={v => setRates(r => ({ ...r, addon_pay_rate_per_lf: v }))} />
          <RateField label="Return trip fee ($)" value={rates.return_trip_fee} onChangeText={v => setRates(r => ({ ...r, return_trip_fee: v }))} />
          <RateField label="Change order admin fee ($)" value={rates.change_order_fee} onChangeText={v => setRates(r => ({ ...r, change_order_fee: v }))} />
          <RateField label="Max delay liability ($)" value={rates.delay_liability_cap} onChangeText={v => setRates(r => ({ ...r, delay_liability_cap: v }))} />
          <RateField label="Payment terms (days)" value={rates.payment_terms_days} onChangeText={v => setRates(r => ({ ...r, payment_terms_days: v }))} />
          <TouchableOpacity style={styles.saveButton} onPress={saveRates} disabled={savingRates}>
            {savingRates ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveButtonText}>Save Rates</Text>}
          </TouchableOpacity>
        </View>
      )}

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

function RateField({ label, value, onChangeText }: { label: string; value: string; onChangeText: (v: string) => void }) {
  return (
    <View style={styles.rateField}>
      <Text style={styles.rateFieldLabel}>{label}</Text>
      <TextInput
        style={styles.rateInput}
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
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  editLink: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },
  cancelLink: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '600' },
  feeCard: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  feeEditCard: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
  feeNote: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  label: { fontSize: fontSize.sm, color: colors.textMuted },
  value: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500' },
  rateField: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rateFieldLabel: { flex: 1, fontSize: fontSize.sm, color: colors.text },
  rateInput: { width: 90, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.sm, fontSize: fontSize.sm, color: colors.text, textAlign: 'right', backgroundColor: colors.background },
  saveButton: { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center', marginTop: spacing.xs },
  saveButtonText: { color: colors.white, fontWeight: '700', fontSize: fontSize.sm },
  signOutButton: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.md },
  signOutText: { color: colors.textMuted, fontWeight: '600' },
});
