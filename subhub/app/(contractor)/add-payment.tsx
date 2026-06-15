import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useStripe } from '@stripe/stripe-react-native';
import { supabase } from '@/lib/supabase';
import { saveContractorStripeCustomer } from '@/lib/stripe';
import PaymentStatus from '@/components/PaymentStatus';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

export default function AddPaymentScreen() {
  const router = useRouter();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSetup() {
    setLoading(true);
    try {
      // Create/retrieve Stripe customer and SetupIntent via Edge Function
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
      const fnUrl = supabaseUrl.replace('.supabase.co', '.supabase.co/functions/v1');

      const res = await fetch(`${fnUrl}/setup-payment-method`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      const { setupIntentClientSecret, customerId, ephemeralKey } = await res.json();

      const { error: initError } = await initPaymentSheet({
        customerId,
        customerEphemeralKeySecret: ephemeralKey,
        setupIntentClientSecret,
        merchantDisplayName: 'SubHub',
        style: 'alwaysLight',
      });

      if (initError) throw new Error(initError.message);

      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code !== 'Canceled') throw new Error(presentError.message);
        setLoading(false);
        return;
      }

      await saveContractorStripeCustomer(customerId);
      setConnected(true);
      Alert.alert('Payment Method Added', 'You can now post jobs and pay subcontractors through SubHub.');
    } catch (err) {
      Alert.alert('Setup Failed', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Payment Method</Text>
      <Text style={styles.subheading}>
        SubHub charges your card when a job is complete and a subcontractor is paid out.
        You have {'{10–14}'} day terms before your card is charged.
      </Text>

      <PaymentStatus connected={connected} type="contractor" />

      {connected ? (
        <View style={styles.doneBox}>
          <Text style={styles.doneIcon}>✅</Text>
          <Text style={styles.doneText}>Payment method saved.</Text>
          <TouchableOpacity style={styles.doneButton} onPress={() => router.back()}>
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.setupBox}>
          <Text style={styles.setupTitle}>How billing works:</Text>
          {[
            'Job is posted and claimed by a sub',
            'Sub completes work + collects customer sign-off',
            'You confirm completion and release payment',
            'Your card is charged; sub receives payout',
          ].map((step, i) => (
            <View key={step} style={styles.step}>
              <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
          <TouchableOpacity style={styles.addButton} onPress={handleSetup} disabled={loading}>
            {loading
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.addText}>Add Payment Method</Text>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, gap: spacing.lg },
  heading: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.text },
  subheading: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 20 },
  doneBox: { alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  doneIcon: { fontSize: 48 },
  doneText: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  doneButton: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
  },
  doneButtonText: { color: colors.white, fontWeight: '700', fontSize: fontSize.md },
  setupBox: { gap: spacing.md },
  setupTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  step: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  stepNum: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  stepNumText: { color: colors.white, fontWeight: '700', fontSize: fontSize.xs },
  stepText: { flex: 1, fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },
  addButton: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center', marginTop: spacing.sm,
  },
  addText: { color: colors.white, fontWeight: '700', fontSize: fontSize.md },
});
