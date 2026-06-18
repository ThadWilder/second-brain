import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { getMyReferralCode, shareReferral, getMyReferrals } from '@/lib/referrals';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

// "Invite & earn visibility" panel — used on both contractor and sub profiles.
export default function ReferralCard() {
  const [code, setCode] = useState<string | null>(null);
  const [completed, setCompleted] = useState(0);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [c, refs] = await Promise.all([getMyReferralCode(), getMyReferrals()]);
        setCode(c);
        setCompleted(refs.filter(r => r.status === 'completed').length);
        setPending(refs.filter(r => r.status === 'pending').length);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  if (loading) return <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />;
  if (!code) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>🔗 Invite & earn visibility</Text>
      <Text style={styles.body}>
        Share your link. When someone you refer completes their first job, you get a temporary boost on the board.
      </Text>
      <View style={styles.codeRow}>
        <View style={styles.codeBox}><Text style={styles.code}>{code}</Text></View>
        <TouchableOpacity style={styles.shareBtn} onPress={() => shareReferral(code)}>
          <Text style={styles.shareText}>Share link</Text>
        </TouchableOpacity>
      </View>
      {(completed > 0 || pending > 0) && (
        <Text style={styles.stats}>
          {completed} joined & active · {pending} pending
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  title: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  body: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 18 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  codeBox: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingVertical: spacing.sm, alignItems: 'center' },
  code: { fontSize: fontSize.md, fontWeight: '800', color: colors.primary, letterSpacing: 2 },
  shareBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  shareText: { color: colors.white, fontWeight: '700', fontSize: fontSize.sm },
  stats: { fontSize: fontSize.xs, color: colors.textMuted },
});
