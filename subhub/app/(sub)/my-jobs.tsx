import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import JobCard from '@/components/JobCard';
import { colors, spacing, fontSize } from '@/lib/theme';
import type { Job } from '@/lib/types';

export default function MyJobsScreen() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyJobs();
  }, []);

  async function fetchMyJobs() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase
      .from('jobs')
      .select('*')
      .eq('claimed_by', user!.id)
      .not('status', 'eq', 'posted')
      .order('claimed_at', { ascending: false });
    setJobs(data ?? []);
    setLoading(false);
  }

  const active = jobs.filter(j => ['claimed', 'in_progress', 'pending_review'].includes(j.status));
  const completed = jobs.filter(j => j.status === 'complete');

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.accent} />
      ) : (
        <FlatList
          data={[...active, ...completed]}
          keyExtractor={j => j.id}
          renderItem={({ item }) => (
            <JobCard
              job={item}
              variant="manage"
              onPress={() => router.push(`/(sub)/jobs/${item.id}`)}
            />
          )}
          ListHeaderComponent={() => (
            <>
              {active.length > 0 && <SectionHeader title={`Active (${active.length})`} />}
            </>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🔨</Text>
              <Text style={styles.emptyText}>No jobs yet. Browse the job board to get started.</Text>
              <TouchableOpacity style={styles.browseButton} onPress={() => router.push('/(sub)/')}>
                <Text style={styles.browseText}>Browse Jobs</Text>
              </TouchableOpacity>
            </View>
          }
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  loader: { marginTop: spacing.xxl },
  list: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  sectionHeader: {
    fontSize: fontSize.sm, fontWeight: '700', color: colors.textMuted,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  empty: { alignItems: 'center', padding: spacing.xxl, gap: spacing.md },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: fontSize.md, color: colors.textMuted, textAlign: 'center' },
  browseButton: {
    backgroundColor: colors.accent, paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm, borderRadius: 999,
  },
  browseText: { color: colors.white, fontWeight: '600', fontSize: fontSize.sm },
});
