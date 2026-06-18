import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, Alert,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

type PaymentRow = {
  sub_payout: number;
  platform_fee_sub: number;
  status: string;
  paid_out_at: string | null;
  created_at: string;
  job_id: string;
};

type MonthGroup = { key: string; label: string; total: number };

const PENDING_STATUSES = ['held', 'processing', 'pending'];

function monthKey(row: PaymentRow): string {
  const dateStr = row.paid_out_at || row.created_at;
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function EarningsScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setRows([]); setLoading(false); return; }

    const { data } = await supabase
      .from('payment_records')
      .select('sub_payout, platform_fee_sub, status, paid_out_at, created_at, job_id')
      .eq('sub_id', user.id);

    setRows((data as PaymentRow[]) ?? []);
    setLoading(false);
  }

  const released = rows.filter(r => r.status === 'released');
  const totalEarned = released.reduce((sum, r) => sum + Number(r.sub_payout || 0), 0);
  const pending = rows
    .filter(r => PENDING_STATUSES.includes(r.status))
    .reduce((sum, r) => sum + Number(r.sub_payout || 0), 0);
  const jobsPaid = released.length;

  const monthly: MonthGroup[] = (() => {
    const map = new Map<string, number>();
    for (const r of released) {
      const key = monthKey(r);
      map.set(key, (map.get(key) ?? 0) + Number(r.sub_payout || 0));
    }
    return Array.from(map.entries())
      .map(([key, total]) => ({ key, label: monthLabel(key), total }))
      .sort((a, b) => (a.key < b.key ? 1 : -1));
  })();

  function export1099() {
    const year = new Date().getFullYear();
    const yearTotal = released
      .filter(r => new Date(r.paid_out_at || r.created_at).getFullYear() === year)
      .reduce((sum, r) => sum + Number(r.sub_payout || 0), 0);

    Alert.alert(
      `1099 Summary — ${year}`,
      `Total earned: $${fmt(yearTotal)}\n\nThis is your gross platform earnings for tax purposes.`,
    );
  }

  if (loading) {
    return <ActivityIndicator style={styles.loader} color={colors.accent} />;
  }

  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>💰</Text>
        <Text style={styles.emptyText}>No earnings yet — complete a job to get paid.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.summaryRow}>
        <View style={[styles.statCard, styles.statCardAccent]}>
          <Text style={styles.statLabel}>Total Earned</Text>
          <Text style={[styles.statValue, styles.statValueAccent]}>${fmt(totalEarned)}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Pending</Text>
          <Text style={styles.statValue}>${fmt(pending)}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Jobs Paid</Text>
          <Text style={styles.statValue}>{jobsPaid}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.exportBtn} onPress={export1099}>
        <Text style={styles.exportBtnText}>📄 Export 1099 Summary</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Monthly Breakdown</Text>
      {monthly.length === 0 ? (
        <View style={styles.monthEmpty}>
          <Text style={styles.monthEmptyText}>No released payouts yet.</Text>
        </View>
      ) : (
        <View style={styles.monthList}>
          {monthly.map(m => (
            <View key={m.key} style={styles.monthRow}>
              <Text style={styles.monthLabel}>{m.label}</Text>
              <Text style={styles.monthTotal}>${fmt(m.total)}</Text>
            </View>
          ))}
        </View>
      )}

      {rows.filter(r => PENDING_STATUSES.includes(r.status)).length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Pending Payouts</Text>
          <View style={styles.monthList}>
            {rows.filter(r => PENDING_STATUSES.includes(r.status)).map(r => (
              <TouchableOpacity
                key={r.id}
                style={styles.pendingRow}
                onPress={() => router.push({ pathname: '/(sub)/payout-status/[jobId]', params: { jobId: r.job_id } } as any)}
              >
                <View style={styles.flex}>
                  <Text style={styles.monthLabel}>${fmt(Number(r.sub_payout ?? 0))}</Text>
                  <Text style={styles.pendingStatus}>
                    {r.status === 'held' ? '⏳ Held' : r.status === 'processing' ? '⚡ Processing' : '🕐 Pending'}
                  </Text>
                </View>
                <Text style={styles.pendingArrow}>→</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.lg },
  loader: { flex: 1, marginTop: spacing.xxl },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md, backgroundColor: colors.surface },
  emptyIcon: { fontSize: 44 },
  emptyText: { fontSize: fontSize.md, color: colors.textMuted, textAlign: 'center' },

  summaryRow: { flexDirection: 'row', gap: spacing.sm },
  statCard: {
    flex: 1, backgroundColor: colors.background, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs,
  },
  statCardAccent: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  statLabel: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '600' },
  statValue: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text },
  statValueAccent: { color: colors.accent },

  exportBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  exportBtnText: { color: colors.white, fontSize: fontSize.md, fontWeight: '700' },

  sectionTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.text },
  monthList: {
    backgroundColor: colors.background, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  monthRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  monthLabel: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600' },
  monthTotal: { fontSize: fontSize.sm, color: colors.accent, fontWeight: '800' },
  monthEmpty: { padding: spacing.lg, backgroundColor: colors.background, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  monthEmptyText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
  pendingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  flex: { flex: 1 },
  pendingStatus: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  pendingArrow: { fontSize: fontSize.md, color: colors.textMuted },
});
