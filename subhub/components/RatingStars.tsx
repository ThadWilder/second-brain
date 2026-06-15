import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, fontSize } from '@/lib/theme';

interface RatingStarsProps {
  value: number;
  count?: number;
  size?: 'sm' | 'md' | 'lg';
  interactive?: boolean;
  onRate?: (stars: number) => void;
}

export default function RatingStars({ value, count, size = 'md', interactive, onRate }: RatingStarsProps) {
  const starSize = size === 'sm' ? 12 : size === 'md' ? 16 : 22;

  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map(n => (
        <TouchableOpacity
          key={n}
          disabled={!interactive}
          onPress={() => onRate?.(n)}
        >
          <Text style={{ fontSize: starSize }}>
            {n <= Math.round(value) ? '★' : '☆'}
          </Text>
        </TouchableOpacity>
      ))}
      {count !== undefined && (
        <Text style={[styles.count, { fontSize: size === 'sm' ? fontSize.xs : fontSize.sm }]}>
          {value.toFixed(1)} ({count})
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  count: { color: colors.textMuted, marginLeft: spacing.xs },
});
