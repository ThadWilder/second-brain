import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import type { Job, JobStatus } from '@/lib/types';

const STATUS_COLORS: Record<JobStatus, string> = {
  draft: colors.textLight,
  posted: colors.statusPosted,
  claimed: colors.statusClaimed,
  in_progress: colors.statusInProgress,
  pending_review: colors.statusClaimed,
  complete: colors.statusComplete,
  disputed: colors.statusDisputed,
};

const STATUS_LABELS: Record<JobStatus, string> = {
  draft: 'Draft',
  posted: 'Open',
  claimed: 'Claimed',
  in_progress: 'In Progress',
  pending_review: 'Pending Review',
  complete: 'Complete',
  disputed: 'Disputed',
};

interface JobCardProps {
  job: Job;
  onPress: () => void;
  variant?: 'board' | 'manage';
  onMessage?: () => void;
}

export default function JobCard({ job, onPress, variant = 'board', onMessage }: JobCardProps) {
  const payout = job.sub_payout.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text style={styles.title} numberOfLines={2}>{job.title}</Text>
          <Text style={styles.location}>{job.city}, {job.state}</Text>
        </View>
        <View style={styles.payoutBox}>
          <Text style={styles.payout}>{payout}</Text>
          <Text style={styles.payoutLabel}>payout</Text>
        </View>
      </View>

      <View style={styles.meta}>
        <Chip icon="📅" label={`${job.estimated_days}d`} />
        <Chip icon="🏗️" label={job.industry} />
        <Chip icon="📦" label={materialLabel(job.material_status)} />
        {variant === 'manage' && (
          <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[job.status] + '20' }]}>
            <Text style={[styles.statusText, { color: STATUS_COLORS[job.status] }]}>
              {STATUS_LABELS[job.status]}
            </Text>
          </View>
        )}
      </View>

      {variant === 'board' && (
        <Text style={styles.scope} numberOfLines={2}>{job.scope_of_work}</Text>
      )}
      {variant === 'manage' && onMessage && job.claimed_by && (
        <TouchableOpacity
          style={styles.messageRow}
          onPress={(e) => { e.stopPropagation?.(); onMessage(); }}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          <Text style={styles.messageRowText}>💬 Message Sub</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

function Chip({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipIcon}>{icon}</Text>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

function materialLabel(status: Job['material_status']) {
  if (status === 'on_site') return 'Material on-site';
  if (status === 'local') return 'Local pickup';
  return 'Material distant';
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1, gap: 2 },
  title: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  location: { fontSize: fontSize.sm, color: colors.textMuted },
  payoutBox: { alignItems: 'flex-end', justifyContent: 'center' },
  payout: { fontSize: fontSize.xl, fontWeight: '800', color: colors.accent },
  payoutLabel: { fontSize: fontSize.xs, color: colors.textMuted },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.surfaceAlt, borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
  },
  chipIcon: { fontSize: 10 },
  chipText: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
  statusBadge: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  statusText: { fontSize: fontSize.xs, fontWeight: '600' },
  scope: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 18 },
  messageRow: {
    borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm,
    alignItems: 'flex-start',
  },
  messageRowText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },
});
