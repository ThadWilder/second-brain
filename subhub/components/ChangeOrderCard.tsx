import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { notify } from '@/lib/notifications';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import type { ChangeOrder, UserRole } from '@/lib/types';

interface Props {
  changeOrder: ChangeOrder;
  role: UserRole;
  contractorId: string;
  subId: string;
  jobTitle: string;
  onUpdated: () => void;
}

const TYPE_LABELS: Record<ChangeOrder['type'], string> = {
  layout: 'Layout Change',
  material: 'Material Change',
  addon: 'Add-On',
  scope: 'Scope Change',
};

export default function ChangeOrderCard({ changeOrder, role, contractorId, subId, jobTitle, onUpdated }: Props) {
  const [loading, setLoading] = useState(false);

  const myApproval = role === 'contractor' ? changeOrder.contractor_approved : changeOrder.sub_approved;
  const canAct = changeOrder.status === 'open' && !myApproval;

  async function handleApprove() {
    setLoading(true);
    const update: Partial<ChangeOrder> = role === 'contractor'
      ? { contractor_approved: true }
      : { sub_approved: true };

    const bothApproved =
      (role === 'contractor' && changeOrder.sub_approved) ||
      (role === 'subcontractor' && changeOrder.contractor_approved);

    if (bothApproved) {
      (update as any).status = 'approved';
    }

    await supabase.from('change_orders').update(update).eq('id', changeOrder.id);

    if (bothApproved) {
      const notifyId = role === 'contractor' ? subId : contractorId;
      await notify.changeOrderApproved(notifyId, jobTitle);
    }

    setLoading(false);
    onUpdated();
  }

  async function handleDispute() {
    setLoading(true);
    await supabase
      .from('change_orders')
      .update({ status: 'disputed' })
      .eq('id', changeOrder.id);
    setLoading(false);
    onUpdated();
  }

  const statusColor = {
    open: colors.statusClaimed,
    approved: colors.statusComplete,
    disputed: colors.statusDisputed,
    resolved: colors.textLight,
  }[changeOrder.status];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.type}>{TYPE_LABELS[changeOrder.type]}</Text>
        <View style={[styles.statusPill, { backgroundColor: statusColor + '20' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {changeOrder.status.charAt(0).toUpperCase() + changeOrder.status.slice(1)}
          </Text>
        </View>
      </View>

      <Text style={styles.description}>{changeOrder.description}</Text>

      {changeOrder.total_adjustment > 0 && (
        <View style={styles.payRow}>
          {changeOrder.delay_pay > 0 && (
            <PayChip label="Delay pay" amount={changeOrder.delay_pay} />
          )}
          {changeOrder.addon_pay > 0 && (
            <PayChip label="Add-on pay" amount={changeOrder.addon_pay} />
          )}
          {changeOrder.return_trip_pay > 0 && (
            <PayChip label="Return trip" amount={changeOrder.return_trip_pay} />
          )}
          <View style={styles.totalChip}>
            <Text style={styles.totalLabel}>Total adjustment</Text>
            <Text style={styles.totalAmount}>+${changeOrder.total_adjustment.toLocaleString()}</Text>
          </View>
          {!!changeOrder.platform_markup && changeOrder.platform_markup > 0 && (
            <Text style={styles.markupNote}>
              Includes a platform fee of ${changeOrder.platform_markup.toLocaleString()} on the change value.
            </Text>
          )}
        </View>
      )}

      <View style={styles.approvalRow}>
        <ApprovalDot label="Contractor" approved={changeOrder.contractor_approved} />
        <ApprovalDot label="Sub" approved={changeOrder.sub_approved} />
      </View>

      {canAct && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.approveButton}
            onPress={handleApprove}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={colors.white} size="small" />
              : <Text style={styles.approveText}>Approve Change</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.disputeButton}
            onPress={handleDispute}
            disabled={loading}
          >
            <Text style={styles.disputeText}>Dispute</Text>
          </TouchableOpacity>
        </View>
      )}

      {myApproval && changeOrder.status === 'open' && (
        <Text style={styles.waitingText}>Waiting for the other party to approve.</Text>
      )}
    </View>
  );
}

function PayChip({ label, amount }: { label: string; amount: number }) {
  return (
    <View style={styles.payChip}>
      <Text style={styles.payChipLabel}>{label}</Text>
      <Text style={styles.payChipAmount}>+${amount.toLocaleString()}</Text>
    </View>
  );
}

function ApprovalDot({ label, approved }: { label: string; approved: boolean }) {
  return (
    <View style={styles.approvalItem}>
      <View style={[styles.dot, approved ? styles.dotApproved : styles.dotPending]} />
      <Text style={styles.approvalLabel}>{label}: {approved ? 'Approved' : 'Pending'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    gap: spacing.sm,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  type: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: 999 },
  statusText: { fontSize: fontSize.xs, fontWeight: '600' },
  description: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },
  payRow: { gap: spacing.xs },
  payChip: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: colors.background, borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  payChipLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  payChipAmount: { fontSize: fontSize.sm, color: colors.accent, fontWeight: '600' },
  totalChip: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: colors.accentLight, borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  totalLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  totalAmount: { fontSize: fontSize.sm, fontWeight: '800', color: colors.accent },
  markupNote: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic', marginTop: 4 },
  approvalRow: { flexDirection: 'row', gap: spacing.lg },
  approvalItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotApproved: { backgroundColor: colors.accent },
  dotPending: { backgroundColor: colors.border },
  approvalLabel: { fontSize: fontSize.xs, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  approveButton: {
    flex: 1, backgroundColor: colors.accent, borderRadius: radius.md,
    padding: spacing.sm, alignItems: 'center',
  },
  approveText: { color: colors.white, fontWeight: '700', fontSize: fontSize.sm },
  disputeButton: {
    borderWidth: 1, borderColor: colors.error, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, padding: spacing.sm, alignItems: 'center',
  },
  disputeText: { color: colors.error, fontWeight: '600', fontSize: fontSize.sm },
  waitingText: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic', textAlign: 'center' },
});
