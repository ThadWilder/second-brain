import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import JobCard from '@/components/JobCard';
import SwipeableRow from '@/components/SwipeableRow';
import { colors, spacing, fontSize } from '@/lib/theme';
import type { Job, JobStatus } from '@/lib/types';

const FILTERS: { label: string; value: JobStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Open', value: 'posted' },
  { label: 'Active', value: 'in_progress' },
  { label: 'Done', value: 'complete' },
];

export default function ContractorDashboard() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState<JobStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJobs();
  }, []);

  async function fetchJobs() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase
      .from('jobs')
      .select('*')
      .eq('contractor_id', user!.id)
      .eq('archived', false)
      .order('created_at', { ascending: false });
    setJobs(data ?? []);
    setLoading(false);
  }

  async function archiveJob(job: Job) {
    setJobs(prev => prev.filter(j => j.id !== job.id));  // optimistic
    const { error } = await supabase.from('jobs').update({ archived: true }).eq('id', job.id);
    if (error) { Alert.alert('Could not archive', error.message); fetchJobs(); }
  }

  function inviteSub(job: Job) {
    // Open Find Subs to invite someone to this specific job.
    router.push({ pathname: '/(contractor)/subs', params: { jobId: job.id } } as any);
  }

  const filtered = filter === 'all' ? jobs : jobs.filter(j => j.status === filter);

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filterChip, filter === f.value && styles.filterChipActive]}
            onPress={() => setFilter(f.value)}
          >
            <Text style={[styles.filterText, filter === f.value && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : (
        <FlatList
          data={filtered}
          ListHeaderComponent={
            filtered.length > 0
              ? <Text style={styles.swipeHint}>← Swipe a job for quick actions</Text>
              : null
          }
          keyExtractor={j => j.id}
          renderItem={({ item }) => (
            <SwipeableRow
              actions={[
                { label: 'Invite a Sub', icon: '📨', color: colors.primary, onPress: () => inviteSub(item) },
                { label: 'Archive', icon: '🗂️', color: colors.textMuted, onPress: () => archiveJob(item) },
              ]}
            >
              <JobCard
                job={item}
                variant="manage"
                onPress={() => router.push(`/(contractor)/jobs/${item.id}`)}
                onMessage={item.claimed_by ? () => router.push({ pathname: '/(contractor)/chat/[jobId]', params: { jobId: item.id } }) : undefined}
              />
            </SwipeableRow>
          )}
          ListEmptyComponent={<EmptyState filter={filter} />}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

function EmptyState({ filter }: { filter: string }) {
  const router = useRouter();
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>📋</Text>
      <Text style={styles.emptyText}>
        {filter === 'all' ? "No jobs yet. Post your first job to get started." : `No ${filter} jobs.`}
      </Text>
      {filter === 'all' && (
        <TouchableOpacity style={styles.emptyButton} onPress={() => router.push('/(contractor)/post-job')}>
          <Text style={styles.emptyButtonText}>Post a Job</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  filterRow: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  filterChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: 999, borderWidth: 1, borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '500' },
  filterTextActive: { color: colors.white },
  loader: { marginTop: spacing.xxl },
  list: { paddingTop: spacing.md, paddingBottom: spacing.xxl },
  swipeHint: { fontSize: fontSize.xs, color: colors.textLight, textAlign: 'right', paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  empty: { alignItems: 'center', padding: spacing.xxl, gap: spacing.md },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: fontSize.md, color: colors.textMuted, textAlign: 'center' },
  emptyButton: {
    backgroundColor: colors.primary, paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm, borderRadius: 999,
  },
  emptyButtonText: { color: colors.white, fontWeight: '600', fontSize: fontSize.sm },
});
