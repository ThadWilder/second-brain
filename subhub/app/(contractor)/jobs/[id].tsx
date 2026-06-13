import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import RatingStars from '@/components/RatingStars';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import type { Job } from '@/lib/types';

export default function ContractorJobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchJob(); }, [id]);

  async function fetchJob() {
    const { data } = await supabase
      .from('jobs')
      .select('*, claimed_sub:sub_profiles!claimed_by(*)')
      .eq('id', id)
      .single();
    setJob(data);
    setLoading(false);
  }

  async function handleCancel() {
    Alert.alert('Cancel Job?', 'This will remove the listing. Subs who were watching it will be notified.', [
      { text: 'Keep Job', style: 'cancel' },
      {
        text: 'Cancel Job', style: 'destructive',
        onPress: async () => {
          await supabase.from('jobs').update({ status: 'draft' }).eq('id', id);
          router.back();
        },
      },
    ]);
  }

  if (loading) return <ActivityIndicator style={styles.loader} color={colors.primary} />;
  if (!job) return <Text style={styles.notFound}>Job not found.</Text>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{job.title}</Text>
        <StatusPill status={job.status} />
      </View>

      <Text style={styles.location}>📍 {job.address}, {job.city}, {job.state}</Text>
      <Text style={styles.payout}>
        Sub payout: <Text style={styles.payoutAmount}>${job.sub_payout.toLocaleString()}</Text>
      </Text>

      {job.claimed_sub && (
        <View style={styles.subCard}>
          <Text style={styles.subCardLabel}>Claimed by</Text>
          <Text style={styles.subName}>{job.claimed_sub.name}</Text>
          <RatingStars value={job.claimed_sub.rating} count={job.claimed_sub.rating_count} size="sm" />
          <TouchableOpacity style={styles.messageButton}>
            <Text style={styles.messageText}>💬 Message Sub</Text>
          </TouchableOpacity>
        </View>
      )}

      <Section title="Scope">
        <Text style={styles.body}>{job.scope_of_work}</Text>
      </Section>

      <Section title="Materials">
        <InfoRow label="Supplier" value={job.material_supplier} />
        <InfoRow label="Status" value={job.material_status.replace('_', ' ')} />
      </Section>

      <Section title="Schedule">
        <InfoRow label="Start Window" value={`${job.start_window_start} → ${job.start_window_end}`} />
        <InfoRow label="Duration" value={`${job.estimated_days} days`} />
      </Section>

      {job.status === 'posted' && (
        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
          <Text style={styles.cancelText}>Cancel Job</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors_map: Record<string, string> = {
    posted: '#3b82f6', claimed: '#f59e0b', in_progress: '#8b5cf6', complete: '#22c55e',
  };
  const bg = colors_map[status] ?? colors.textLight;
  return (
    <View style={[styles.pill, { backgroundColor: bg + '20' }]}>
      <Text style={[styles.pillText, { color: bg }]}>{status.replace('_', ' ')}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loader: { marginTop: spacing.xxl },
  notFound: { textAlign: 'center', marginTop: spacing.xxl, color: colors.textMuted },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { flex: 1, fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: fontSize.xs, fontWeight: '600', textTransform: 'capitalize' },
  location: { fontSize: fontSize.sm, color: colors.textMuted },
  payout: { fontSize: fontSize.md, color: colors.textMuted },
  payoutAmount: { color: colors.accent, fontWeight: '700' },
  subCard: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, gap: spacing.sm,
    borderLeftWidth: 3, borderLeftColor: colors.accent,
  },
  subCardLabel: { fontSize: fontSize.xs, color: colors.textMuted, textTransform: 'uppercase' },
  subName: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  messageButton: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    padding: spacing.sm, alignItems: 'center', marginTop: spacing.xs,
  },
  messageText: { color: colors.white, fontWeight: '600', fontSize: fontSize.sm },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  body: { fontSize: fontSize.md, color: colors.text, lineHeight: 22 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  infoLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  infoValue: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500' },
  cancelButton: {
    borderWidth: 1, borderColor: colors.error, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center',
  },
  cancelText: { color: colors.error, fontWeight: '600' },
});
