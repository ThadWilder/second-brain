import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Platform } from 'react-native';
import { getRecommendedPartners, type Partner } from '@/lib/partners';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

const CAT_ICON: Record<Partner['category'], string> = {
  accounting: '📒', financing: '💵', insurance: '🛡️', payments: '⚡', materials: '📦', tools: '🛠️',
};

// "Recommended Tools" — clearly-labeled sponsored partners. Rendered ONLY on
// secondary surfaces (profile / dashboard), never inside the core workflow.
export default function RecommendedTools({ audience }: { audience: 'contractor' | 'subcontractor' }) {
  const [partners, setPartners] = useState<Partner[]>([]);

  useEffect(() => {
    getRecommendedPartners(audience).then(setPartners).catch(() => {});
  }, [audience]);

  if (partners.length === 0) return null;

  function open(url: string) {
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(url, '_blank');
    else Linking.openURL(url).catch(() => {});
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>Recommended Tools</Text>
        <Text style={styles.sponsored}>Sponsored</Text>
      </View>
      {partners.map(p => (
        <TouchableOpacity key={p.id} style={styles.row} onPress={() => open(p.url)}>
          <Text style={styles.icon}>{CAT_ICON[p.category]}</Text>
          <View style={styles.flex}>
            <Text style={styles.name}>{p.name}</Text>
            <Text style={styles.blurb} numberOfLines={2}>{p.blurb}</Text>
          </View>
          <Text style={styles.cta}>{p.cta_label} →</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  sponsored: { fontSize: fontSize.xs, color: colors.textLight, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  icon: { fontSize: 24 },
  flex: { flex: 1 },
  name: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  blurb: { fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 16 },
  cta: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '700' },
});
