import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  TouchableOpacity, TextInput, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import JobCard from '@/components/JobCard';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import type { Job } from '@/lib/types';

type SortKey = 'payout' | 'duration' | 'newest';
type DurationFilter = 'all' | '1-2' | '3-5' | '6+';
type PayFilter = 'all' | 'under1k' | '1k-2.5k' | '2.5k-5k' | '5k+';

const SORTS: { label: string; value: SortKey }[] = [
  { label: '💰 Pay', value: 'payout' },
  { label: '📅 Days', value: 'duration' },
  { label: '🆕 Newest', value: 'newest' },
];

const INDUSTRIES = ['All', 'Fencing', 'Decking', 'Pergola / Shade', 'Gates', 'Retaining Walls', 'General'];

const DURATIONS: { label: string; value: DurationFilter }[] = [
  { label: 'Any', value: 'all' },
  { label: '1–2 days', value: '1-2' },
  { label: '3–5 days', value: '3-5' },
  { label: '6+ days', value: '6+' },
];

const PAY_BRACKETS: { label: string; value: PayFilter }[] = [
  { label: 'Any pay', value: 'all' },
  { label: '< $1k', value: 'under1k' },
  { label: '$1k–$2.5k', value: '1k-2.5k' },
  { label: '$2.5k–$5k', value: '2.5k-5k' },
  { label: '$5k+', value: '5k+' },
];

function matchesDuration(days: number, f: DurationFilter) {
  if (f === '1-2') return days <= 2;
  if (f === '3-5') return days >= 3 && days <= 5;
  if (f === '6+') return days >= 6;
  return true;
}

function matchesPay(payout: number, f: PayFilter) {
  if (f === 'under1k') return payout < 1000;
  if (f === '1k-2.5k') return payout >= 1000 && payout < 2500;
  if (f === '2.5k-5k') return payout >= 2500 && payout < 5000;
  if (f === '5k+') return payout >= 5000;
  return true;
}

export default function JobBoardScreen() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [sort, setSort] = useState<SortKey>('newest');
  const [search, setSearch] = useState('');
  const [industry, setIndustry] = useState('All');
  const [duration, setDuration] = useState<DurationFilter>('all');
  const [pay, setPay] = useState<PayFilter>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchJobs(); }, []);

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
    .filter(j =>
      (!search || j.title.toLowerCase().includes(search.toLowerCase()) || j.city.toLowerCase().includes(search.toLowerCase())) &&
      (industry === 'All' || j.industry === industry) &&
      matchesDuration(j.estimated_days, duration) &&
      matchesPay(j.sub_payout, pay)
    )
    .sort((a, b) => {
      if (sort === 'payout') return b.sub_payout - a.sub_payout;
      if (sort === 'duration') return a.estimated_days - b.estimated_days;
      return 0;
    });

  const activeFilters = (industry !== 'All' ? 1 : 0) + (duration !== 'all' ? 1 : 0) + (pay !== 'all' ? 1 : 0);

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

        <FilterRow label="Trade">
          {INDUSTRIES.map(ind => (
            <Chip key={ind} label={ind} active={industry === ind} onPress={() => setIndustry(ind)} />
          ))}
        </FilterRow>

        <FilterRow label="Length">
          {DURATIONS.map(d => (
            <Chip key={d.value} label={d.label} active={duration === d.value} onPress={() => setDuration(d.value)} />
          ))}
        </FilterRow>

        <FilterRow label="Pay">
          {PAY_BRACKETS.map(p => (
            <Chip key={p.value} label={p.label} active={pay === p.value} onPress={() => setPay(p.value)} />
          ))}
        </FilterRow>

        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>Sort:</Text>
          {SORTS.map(s => (
            <TouchableOpacity
              key={s.value}
              style={[styles.sortChip, sort === s.value && styles.sortChipActive]}
              onPress={() => setSort(s.value)}
            >
              <Text style={[styles.sortText, sort === s.value && styles.sortTextActive]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
          {activeFilters > 0 && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => { setIndustry('All'); setDuration('all'); setPay('all'); }}
            >
              <Text style={styles.clearText}>Clear filters ({activeFilters})</Text>
            </TouchableOpacity>
          )}
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
              <Text style={styles.emptyText}>No jobs match your filters.</Text>
            </View>
          }
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.filterRow}>
      <Text style={styles.filterLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {children}
      </ScrollView>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
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
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  filterLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted, width: 40, textTransform: 'uppercase' },
  chipRow: { flexDirection: 'row', gap: spacing.xs },
  chip: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
  chipTextActive: { color: colors.white },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  sortLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  sortChip: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  sortChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  sortText: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
  sortTextActive: { color: colors.white },
  clearButton: { marginLeft: 'auto' as any },
  clearText: { fontSize: fontSize.xs, color: colors.error, fontWeight: '600' },
  loader: { marginTop: spacing.xxl },
  count: { fontSize: fontSize.sm, color: colors.textMuted, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  list: { paddingBottom: spacing.xxl },
  empty: { alignItems: 'center', padding: spacing.xxl, gap: spacing.md },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: fontSize.md, color: colors.textMuted, textAlign: 'center' },
});
