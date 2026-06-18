import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import RatingStars from '@/components/RatingStars';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

const TRADES = ['All', 'Fencing', 'Decking', 'Pergola / Shade', 'Gates', 'Retaining Walls', 'General'];

interface Review {
  rating_id: string;
  contractor_id: string;
  business_name: string;
  rating: number;
  rating_count: number;
  trade: string;
  stars: number;
  comment: string;
  rehire: boolean;
  created_at: string;
}

export default function ReviewsScreen() {
  const router = useRouter();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [trade, setTrade] = useState('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [trade]);

  async function load() {
    setLoading(true);
    const { data } = await supabase.rpc('contractor_reviews', {
      p_trade: trade === 'All' ? null : trade,
      p_limit: 60,
    });
    setReviews((data ?? []) as Review[]);
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <Text style={styles.title}>Contractor Reviews</Text>
        <Text style={styles.sub}>See what other subs say before you claim. Tap a review to see that contractor's open jobs.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {TRADES.map(t => (
            <TouchableOpacity key={t} style={[styles.chip, trade === t && styles.chipOn]} onPress={() => setTrade(t)}>
              <Text style={[styles.chipText, trade === t && styles.chipTextOn]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.accent} />
      ) : reviews.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>⭐</Text>
          <Text style={styles.emptyText}>No reviews yet for this trade.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {reviews.map(r => (
            <TouchableOpacity
              key={r.rating_id}
              style={styles.card}
              onPress={() => router.push(`/(sub)/contractors/${r.contractor_id}` as any)}
            >
              <View style={styles.cardTop}>
                <View style={styles.flex}>
                  <Text style={styles.biz}>{r.business_name}</Text>
                  <View style={styles.metaRow}>
                    <RatingStars value={r.rating ?? 0} count={r.rating_count ?? 0} size="sm" />
                    <View style={styles.tradeChip}><Text style={styles.tradeChipText}>{r.trade}</Text></View>
                  </View>
                </View>
                <View style={styles.starBox}>
                  <Text style={styles.starNum}>{r.stars}★</Text>
                  {r.rehire && <Text style={styles.rehire}>would rehire</Text>}
                </View>
              </View>
              <Text style={styles.comment}>"{r.comment}"</Text>
              <Text style={styles.viewJobs}>View open jobs →</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  head: { backgroundColor: colors.background, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.sm },
  title: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text },
  sub: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 18 },
  chipRow: { flexDirection: 'row', gap: spacing.xs, paddingTop: spacing.xs },
  chip: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
  chipTextOn: { color: colors.white },
  loader: { marginTop: spacing.xxl },
  empty: { alignItems: 'center', padding: spacing.xxl, gap: spacing.md },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: fontSize.md, color: colors.textMuted },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
  card: { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 2 },
  cardTop: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1, gap: 4 },
  biz: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tradeChip: { backgroundColor: colors.surfaceAlt, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  tradeChipText: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '600' },
  starBox: { alignItems: 'flex-end' },
  starNum: { fontSize: fontSize.md, fontWeight: '800', color: colors.warning },
  rehire: { fontSize: fontSize.xs, color: colors.accent, fontWeight: '600' },
  comment: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20, fontStyle: 'italic' },
  viewJobs: { fontSize: fontSize.xs, color: colors.accent, fontWeight: '700', textAlign: 'right' },
});
