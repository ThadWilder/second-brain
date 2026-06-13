import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import * as Linking from 'expo-linking';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { createConnectOnboardingUrl, saveSubStripeAccount } from '@/lib/stripe';
import PaymentStatus from '@/components/PaymentStatus';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

export default function ConnectStripeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ stripe_connected?: string }>();
  const [connected, setConnected] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  // Handle return from Stripe onboarding
  useEffect(() => {
    if (params.stripe_connected === '1' && accountId) {
      saveSubStripeAccount(accountId).then(() => {
        setConnected(true);
        Alert.alert('Connected!', 'Your payout account is set up. You\'re ready to get paid.');
      });
    }
  }, [params.stripe_connected, accountId]);

  async function checkStatus() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase
      .from('sub_profiles')
      .select('stripe_account_id')
      .eq('user_id', user!.id)
      .single();
    setConnected(!!data?.stripe_account_id);
    setAccountId(data?.stripe_account_id ?? null);
    setLoading(false);
  }

  async function handleConnect() {
    setConnecting(true);
    try {
      const returnUrl = Linking.createURL('/connect-stripe');
      const url = await createConnectOnboardingUrl(returnUrl);
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setConnecting(false);
    }
  }

  if (loading) return <ActivityIndicator style={styles.loader} color={colors.accent} />;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Payout Account</Text>
      <Text style={styles.subheading}>
        Connect your bank account to receive payments when jobs are complete.
        SubHub uses Stripe to securely handle all payouts.
      </Text>

      <PaymentStatus connected={connected} type="sub" />

      {connected ? (
        <View style={styles.connectedBox}>
          <Text style={styles.connectedIcon}>✅</Text>
          <Text style={styles.connectedText}>Your payout account is active.</Text>
          <Text style={styles.connectedDetail}>
            Payments are released when the contractor confirms job completion.
            Instant pay available in Phase 2.
          </Text>
          <TouchableOpacity style={styles.doneButton} onPress={() => router.back()}>
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.setupBox}>
          <Text style={styles.setupTitle}>What you'll set up with Stripe:</Text>
          {['Bank account or debit card for payouts', 'Identity verification (required by law)', 'Tax information (W-9 equivalent)'].map(item => (
            <View key={item} style={styles.checkItem}>
              <Text style={styles.checkIcon}>•</Text>
              <Text style={styles.checkText}>{item}</Text>
            </View>
          ))}
          <Text style={styles.securityNote}>
            Your banking information is handled directly by Stripe — SubHub never sees your account details.
          </Text>
          <TouchableOpacity style={styles.connectButton} onPress={handleConnect} disabled={connecting}>
            {connecting
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.connectText}>Connect with Stripe →</Text>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, gap: spacing.lg },
  loader: { marginTop: spacing.xxl },
  heading: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.text },
  subheading: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 20 },
  connectedBox: { alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  connectedIcon: { fontSize: 48 },
  connectedText: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  connectedDetail: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  doneButton: {
    backgroundColor: colors.accent, borderRadius: radius.md,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
  },
  doneText: { color: colors.white, fontWeight: '700', fontSize: fontSize.md },
  setupBox: { gap: spacing.md },
  setupTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  checkItem: { flexDirection: 'row', gap: spacing.sm },
  checkIcon: { color: colors.accent, fontWeight: '700' },
  checkText: { fontSize: fontSize.sm, color: colors.text, flex: 1 },
  securityNote: {
    fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 18,
    backgroundColor: colors.surfaceAlt, padding: spacing.md, borderRadius: radius.md,
  },
  connectButton: {
    backgroundColor: colors.accent, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center', marginTop: spacing.sm,
  },
  connectText: { color: colors.white, fontWeight: '700', fontSize: fontSize.md },
});
