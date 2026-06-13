import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

interface Props {
  connected: boolean;
  type?: 'sub' | 'contractor';
}

export default function PaymentStatus({ connected, type = 'sub' }: Props) {
  if (connected) {
    return (
      <View style={styles.connected}>
        <Text style={styles.connectedText}>
          {type === 'sub' ? '⚡ Payout account connected' : '💳 Payment method on file'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.pending}>
      <Text style={styles.pendingText}>
        {type === 'sub'
          ? '⚠️ Connect your bank to receive payouts'
          : '⚠️ Add a payment method to post jobs'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  connected: {
    backgroundColor: colors.accentLight, borderRadius: radius.md,
    padding: spacing.sm, alignItems: 'center',
  },
  connectedText: { fontSize: fontSize.sm, color: colors.accent, fontWeight: '600' },
  pending: {
    backgroundColor: '#fef3c7', borderRadius: radius.md,
    padding: spacing.sm, alignItems: 'center',
  },
  pendingText: { fontSize: fontSize.sm, color: '#92400e', fontWeight: '600' },
});
