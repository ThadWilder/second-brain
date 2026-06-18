import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

// Diversification Score — rewards healthy breadth across many contractors
// (anti-concentration), a secondary signal that always ranks below Crew.
// Self-contained: computes via the diversification_score RPC for the user.
export default function DiversificationBadge({ userId }: { userId: string }) {
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.rpc('diversification_score', { p_sub: userId });
        setScore(typeof data === 'number' ? data : null);
      } catch { /* ignore */ }
    })();
  }, [userId]);

  if (score === null) return null;
  const label = score >= 70 ? 'Well diversified' : score >= 40 ? 'Building breadth' : 'Concentrated';
  const color = score >= 70 ? colors.statusComplete : score >= 40 ? colors.warning : colors.error;

  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.score, { color }]}>{score}</Text>
      <View>
        <Text style={styles.title}>Diversification</Text>
        <Text style={styles.label}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.background,
  },
  score: { fontSize: fontSize.xl, fontWeight: '800' },
  title: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase' },
  label: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600' },
});
