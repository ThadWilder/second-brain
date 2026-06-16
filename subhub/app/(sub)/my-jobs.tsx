import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import JobCard from '@/components/JobCard';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import type { Job } from '@/lib/types';

const STATUS_LABELS: Record<string, string> = {
  claimed: 'Claimed',
  in_progress: 'In Progress',
  pending_review: 'Pending Review',
  complete: 'Complete',
  disputed: 'Disputed',
};

export default function MyJobsScreen() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchMyJobs(); }, []);

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

  const active = jobs.filter(j => ['claimed', 'in_progress', 'pending_review', 'disputed'].includes(j.status));
  const completed = jobs.filter(j => j.status === 'complete');

  const totalEarned = completed.reduce((sum, j) => sum + (j.sub_payout ?? 0), 0);

  if (loading) return <ActivityIndicator style={styles.loader} color={colors.accent} />;

  if (jobs.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>🔨</Text>
        <Text style={styles.emptyText}>No jobs yet. Browse the job board to get started.</Text>
        <TouchableOpacity style={styles.browseButton} onPress={() => router.push('/(sub)/')}>
          <Text style={styles.browseText}>Browse Jobs</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {active.length > 0 && (
        <>
          <SectionHeader title={`Active  ·  ${active.length}`} />
          {active.map(j => (
            <View key={j.id} style={styles.cardWrap}>
              <JobCard
                job={j}
                variant="manage"
                onPress={() => router.push(`/(sub)/jobs/${j.id}`)}
              />
              <View style={styles.statusBar}>
                <Text style={styles.statusLabel}>{STATUS_LABELS[j.status] ?? j.status}</Text>
                {j.status === 'in_progress' && (
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: '/(sub)/change-order', params: { jobId: j.id } })}
                  >
                    <Text style={styles.coLink}>+ Change Order</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </>
      )}

      {completed.length > 0 && (
        <>
          <SectionHeader
            title={`Completed  ·  ${completed.length}`}
            right={`${totalEarned.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} earned`}
          />
          {completed.map(j => (
            <View key={j.id} style={[styles.cardWrap, styles.cardWrapCompleted]}>
              <JobCard
                job={j}
                variant="manage"
                onPress={() => router.push(`/(sub)/jobs/${j.id}`)}
              />
              <View style={styles.statusBar}>
                <Text style={[styles.statusLabel, styles.statusComplete]}>✓ Complete</Text>
                <Text style={styles.earnedLabel}>
                  {(j.sub_payout ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} earned
                </Text>
              </View>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function SectionHeader({ title, right }: { title: string; right?: string }) {
  return (
    <View style={styles.sectionHeaderRow}>
      <Text style={styles.sectionHeader}>{title}</Text>
      {right && <Text style={styles.sectionHeaderRight}>{right}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  loader: { marginTop: spacing.xxl },
  sectionHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  sectionHeader: {
    fontSize: fontSize.sm, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  sectionHeaderRight: { fontSize: fontSize.sm, color: colors.accent, fontWeight: '700' },
  cardWrap: { marginBottom: 2 },
  cardWrapCompleted: { opacity: 0.8 },
  statusBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md + spacing.sm,
    paddingVertical: 5,
    marginHorizontal: spacing.md,
    marginTop: -spacing.sm,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: colors.border,
  },
  statusLabel: { fontSize: fontSize.xs, fontWeight: '600', color: colors.textMuted },
  statusComplete: { color: colors.accent },
  earnedLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.accent },
  coLink: { fontSize: fontSize.xs, fontWeight: '600', color: colors.primary },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: fontSize.md, color: colors.textMuted, textAlign: 'center' },
  browseButton: {
    backgroundColor: colors.accent, paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm, borderRadius: 999,
  },
  browseText: { color: colors.white, fontWeight: '600', fontSize: fontSize.sm },
});
