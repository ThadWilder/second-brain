import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import RatingStars from '@/components/RatingStars';

export default function SubDirectory() {
  const [subs, setSubs] = useState<any[]>([]);
  const [reviews, setReviews] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    const { data } = await supabase
      .from('sub_profiles')
      .select('id, user_id, name, service_area_zip, service_area_miles, skills, rating, rating_count, verified')
      .order('rating', { ascending: false });
    setSubs(data ?? []);
    setLoading(false);
  }

  async function loadReviews(userId: string, subId: string) {
    if (reviews[subId]) { setExpanded(expanded === subId ? null : subId); return; }
    const { data } = await supabase
      .from('ratings')
      .select('stars, comment, tags, created_at')
      .eq('ratee_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);
    setReviews(r => ({ ...r, [subId]: data ?? [] }));
    setExpanded(subId);
  }

  const filtered = search.trim()
    ? subs.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.service_area_zip.startsWith(search)
      )
    : subs;

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />;

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or ZIP code..."
          placeholderTextColor={colors.textLight}
        />
      </View>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No subcontractors found</Text>
          <Text style={styles.emptySub}>
            Subs appear here once they sign up and complete onboarding.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name}>{item.name}</Text>
                    {item.verified && <Text style={styles.verified}>✓ Verified</Text>}
                  </View>
                  <RatingStars value={item.rating} count={item.rating_count} size="sm" />
                </View>
                <Text style={styles.zip}>📍 {item.service_area_zip}</Text>
              </View>

              <View style={styles.meta}>
                <Text style={styles.metaText}>
                  Service radius: {item.service_area_miles} miles
                </Text>
                {item.skills?.length > 0 && (
                  <Text style={styles.metaText}>Skills: {item.skills.join(', ')}</Text>
                )}
              </View>

              <TouchableOpacity
                style={styles.reviewsBtn}
                onPress={() => loadReviews(item.user_id, item.id)}
              >
                <Text style={styles.reviewsBtnText}>
                  {expanded === item.id ? 'Hide Reviews ▲' : `View Reviews (${item.rating_count}) ▼`}
                </Text>
              </TouchableOpacity>

              {expanded === item.id && (
                <View style={styles.reviewList}>
                  {(reviews[item.id] ?? []).length === 0 ? (
                    <Text style={styles.noReviews}>No reviews yet.</Text>
                  ) : (
                    (reviews[item.id] ?? []).map((r, i) => (
                      <View key={i} style={styles.review}>
                        <View style={styles.reviewHeader}>
                          <RatingStars value={r.stars} size="sm" />
                          <Text style={styles.reviewDate}>
                            {new Date(r.created_at).toLocaleDateString([], { month: 'short', year: 'numeric' })}
                          </Text>
                        </View>
                        {r.tags?.length > 0 && (
                          <View style={styles.tagRow}>
                            {r.tags.map((t: string) => (
                              <View key={t} style={styles.tag}>
                                <Text style={styles.tagText}>{t}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                        {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
                      </View>
                    ))
                  )}
                </View>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchWrap: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  search: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.sm, fontSize: fontSize.md, color: colors.text,
    backgroundColor: colors.surface,
  },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  emptySub: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  list: { padding: spacing.md, gap: spacing.md },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.lg, gap: spacing.sm,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  name: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  verified: {
    fontSize: fontSize.xs, color: colors.accent, fontWeight: '700',
    backgroundColor: '#dcfce7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  zip: { fontSize: fontSize.sm, color: colors.textMuted },
  meta: { gap: 2 },
  metaText: { fontSize: fontSize.sm, color: colors.textMuted },
  reviewsBtn: { paddingVertical: spacing.xs },
  reviewsBtnText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },
  reviewList: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, gap: spacing.sm },
  noReviews: { fontSize: fontSize.sm, color: colors.textMuted, fontStyle: 'italic' },
  review: { gap: spacing.xs },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewDate: { fontSize: fontSize.xs, color: colors.textLight },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    backgroundColor: '#eff6ff', borderRadius: 12,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  tagText: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600' },
  reviewComment: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 18 },
});
