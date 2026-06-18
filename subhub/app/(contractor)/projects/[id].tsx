import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect, useNavigation } from 'expo-router';
import { getProject, updateProject, setJobProject } from '@/lib/projects';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import type { Project, Job, JobStatus } from '@/lib/types';

const STATUS_LABEL: Record<JobStatus, string> = {
  draft: 'Draft', posted: 'Open', claimed: 'Claimed', in_progress: 'In Progress',
  pending_review: 'Pending Review', complete: 'Complete', disputed: 'Disputed',
};
const STATUS_COLOR: Record<JobStatus, string> = {
  draft: colors.textLight, posted: colors.statusPosted, claimed: colors.statusClaimed,
  in_progress: colors.statusInProgress, pending_review: colors.statusClaimed,
  complete: colors.statusComplete, disputed: colors.statusDisputed,
};

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    getProject(id).then(p => {
      setProject(p);
      setLoading(false);
      if (p) navigation.setOptions({ title: p.title });
    });
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function markComplete() {
    if (!project) return;
    await updateProject(project.id, { status: 'complete' });
    load();
  }

  async function detachJob(jobId: string) {
    Alert.alert('Remove from project?', 'The job stays live — it just leaves this project tile.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await setJobProject(jobId, null); load(); } },
    ]);
  }

  if (loading) return <ActivityIndicator style={styles.loader} color={colors.primary} />;
  if (!project) return <Text style={styles.notFound}>Project not found.</Text>;

  const prog = project.progress;
  const jobs = (project.jobs ?? []).slice().sort((a, b) => (a.sequence_order ?? 999) - (b.sequence_order ?? 999));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {project.customer_name ? <Text style={styles.customer}>👤 {project.customer_name}</Text> : null}
      {project.description ? <Text style={styles.desc}>{project.description}</Text> : null}

      {prog && (
        <View style={styles.summary}>
          <Stat label="Jobs" value={`${prog.complete_jobs}/${prog.total_jobs}`} />
          <Stat label="Open" value={`${prog.posted_jobs}`} />
          <Stat label="In progress" value={`${prog.active_jobs}`} />
          <Stat label="Total payout" value={`$${prog.total_payout.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} />
        </View>
      )}

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Jobs in this project</Text>
        <TouchableOpacity onPress={() => router.push({ pathname: '/(contractor)/post-job', params: { projectId: project.id } } as any)}>
          <Text style={styles.addLink}>+ Add job</Text>
        </TouchableOpacity>
      </View>

      {jobs.length === 0 ? (
        <Text style={styles.emptyJobs}>No jobs yet. Add the first trade to get started.</Text>
      ) : jobs.map((j: Job, i) => (
        <View key={j.id} style={styles.jobCard}>
          <TouchableOpacity style={styles.flex} onPress={() => router.push(`/(contractor)/jobs/${j.id}` as any)}>
            <View style={styles.jobTop}>
              <Text style={styles.seq}>{j.sequence_order ?? i + 1}</Text>
              <Text style={styles.jobTitle} numberOfLines={1}>{j.title}</Text>
            </View>
            <View style={styles.jobMeta}>
              <View style={[styles.badge, { backgroundColor: STATUS_COLOR[j.status] + '22' }]}>
                <Text style={[styles.badgeText, { color: STATUS_COLOR[j.status] }]}>{STATUS_LABEL[j.status]}</Text>
              </View>
              <Text style={styles.jobSub}>{j.industry} · ${j.sub_payout.toLocaleString('en-US', { maximumFractionDigits: 0 })}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => detachJob(j.id)} hitSlop={8}>
            <Text style={styles.detach}>✕</Text>
          </TouchableOpacity>
        </View>
      ))}

      {project.status !== 'complete' && (
        <TouchableOpacity style={styles.completeBtn} onPress={markComplete}>
          <Text style={styles.completeBtnText}>Mark Project Complete</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  loader: { marginTop: spacing.xxl },
  notFound: { textAlign: 'center', marginTop: spacing.xxl, color: colors.textMuted },
  customer: { fontSize: fontSize.md, color: colors.text, fontWeight: '600' },
  desc: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 20 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md },
  statBox: { flex: 1, minWidth: 70, alignItems: 'center' },
  statValue: { fontSize: fontSize.lg, fontWeight: '800', color: colors.primary },
  statLabel: { fontSize: fontSize.xs, color: colors.textMuted },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  addLink: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '700' },
  emptyJobs: { fontSize: fontSize.sm, color: colors.textMuted, fontStyle: 'italic' },
  jobCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md },
  flex: { flex: 1, gap: 4 },
  jobTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  seq: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surfaceAlt, textAlign: 'center', lineHeight: 24, fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted, overflow: 'hidden' },
  jobTitle: { flex: 1, fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  jobMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: 32 },
  badge: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { fontSize: fontSize.xs, fontWeight: '700' },
  jobSub: { fontSize: fontSize.xs, color: colors.textMuted },
  detach: { fontSize: fontSize.md, color: colors.textLight, fontWeight: '700', paddingHorizontal: spacing.xs },
  completeBtn: { borderWidth: 1, borderColor: colors.statusComplete, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.md },
  completeBtnText: { color: colors.statusComplete, fontWeight: '700', fontSize: fontSize.sm },
});
