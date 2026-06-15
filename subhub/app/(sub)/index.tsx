import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  TouchableOpacity, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import JobCard from '@/components/JobCard';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import type { Job } from '@/lib/types';

type SortKey = 'payout' | 'duration' | 'newest';

const SORTS: { label: string; value: SortKey }[] = [
  { label: '💰 Pay', value: 'payout' },
  { label: '📅 Duration', value: 'duration' },
  { label: '🆕 Newest', value: 'newest' },
];

export default function JobBoardScreen() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [sort, setSort] = useState<SortKey>('newest');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJobs();
  }, []);

  async function fetchJobs() {
    const { data } = await supabase
      .from('jobs')
      .select('*, contractor:contractor_profiles(business_name, rating, rating_count)')
      .eq('status', 'posted')
      .order('created_at', { ascending: false });
    setJobs(data ?? []);
    setLoading(false);
  }

  const filtered = jobs
    .filter(j => !search || j.title.toLowerCase().includes(search.toLowerCase()) || j.city.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'payout') return b.sub_payout - a.sub_payout;
      if (sort === 'duration') return a.estimated_days - b.estimated_days;
      return 0;
    });

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TextInput
          style={styles.search}
          placeholder="Search by title or city..."
          placeholderTextColor={colors.textLight}
          value={search}
          onChangeText={setSearch}
        />
        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>Sort:</Text>
          {SORTS.map(s => (
            <TouchableOpacity
              key={s.value}
              style={[styles.sortChip, sort === s.value && styles.sortChipActive]}
              onPress={() => setSort(s.value)}
            >
              <Text style={[styles.sortText, sort === s.value && styles.sortTextActive]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.accent} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={j => j.id}
          renderItem={({ item }) => (
            <JobCard
              job={item}
              variant="board"
              onPress={() => router.push(`/(sub)/jobs/${item.id}`)}
            />
          )}
          ListHeaderComponent={
            <Text style={styles.count}>{filtered.length} job{filtered.length !== 1 ? 's' : ''} available</Text>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyText}>No jobs match your search.</Text>
            </View>
          }
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  topBar: {
    backgroundColor: colors.background, padding: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.sm,
  },
  search: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.sm, fontSize: fontSize.md, color: colors.text, backgroundColor: colors.surface,
  },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sortLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  sortChip: {
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: 999, borderWidth: 1, borderColor: colors.border,
  },
  sortChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  sortText: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
  sortTextActive: { color: colors.white },
  loader: { marginTop: spacing.xxl },
  count: { fontSize: fontSize.sm, color: colors.textMuted, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  list: { paddingBottom: spacing.xxl },
  empty: { alignItems: 'center', padding: spacing.xxl, gap: spacing.md },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: fontSize.md, color: colors.textMuted, textAlign: 'center' },
});
