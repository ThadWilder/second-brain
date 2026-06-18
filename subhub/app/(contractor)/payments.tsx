import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

type PayRow = {
  id: string;
  job_id: string;
  sub_payout: number;
  platform_fee_sub: number;
  platform_fee_contractor: number;
  status: string;
  paid_out_at: string | null;
  created_at: string;
  job: { title: string; city: string; state: string } | null;
  sub: { display_name: string } | null;
};

const PROCESSING_STATUSES = ['held', 'processing', 'pending'];

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function fmtExact(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

function monthLabel(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function ContractorPaymentsScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<PayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'outstanding' | 'paid'>('outstanding');

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data } = await supabase
      .from('payment_records')
      .select(`
        id, job_id, sub_payout, platform_fee_sub, platform_fee_contractor,
        status, paid_out_at, created_at,
        job:jobs(title, city, state),
        sub:sub_profiles(display_name)
      `)
      .eq('contractor_id', user.id)
      .order('created_at', { ascending: false });

    setRows((data as unknown as PayRow[]) ?? []);
    setLoading(false);
  }

  const outstanding = rows.filter(r => PROCESSING_STATUSES.includes(r.status));
  const paid = rows.filter(r => r.status === 'released');

  const totalOutstanding = outstanding.reduce((s, r) => s + Number(r.sub_payout ?? 0), 0);
  const totalPaid = paid.reduce((s, r) => s + Number(r.sub_payout ?? 0), 0);

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthSpend = rows
    .filter(r => new Date(r.created_at) >= periodStart)
    .reduce((s, r) => s + Number(r.sub_payout ?? 0) + Number(r.platform_fee_contractor ?? 0), 0);

  const display = tab === 'outstanding' ? outstanding : paid;

  if (loading) return <ActivityIndicator style={styles.loader} color={colors.primary} />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Summary cards */}
      <View style={styles.statsRow}>
        <StatCard label="Outstanding" value={fmt(totalOutstanding)} accent={totalOutstanding > 0} />
        <StatCard label="Paid Out" value={fmt(totalPaid)} />
        <StatCard label={`${monthLabel(now.toISOString()).split(' ')[0]} Spend`} value={fmt(monthSpend)} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'outstanding' && styles.tabBtnOn]}
          onPress={() => setTab('outstanding')}
        >
          <Text style={[styles.tabText, tab === 'outstanding' && styles.tabTextOn]}>
            Outstanding {outstanding.length > 0 ? `(${outstanding.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'paid' && styles.tabBtnOn]}
          onPress={() => setTab('paid')}
        >
          <Text style={[styles.tabText, tab === 'paid' && styles.tabTextOn]}>
            Paid ({paid.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Empty state */}
      {display.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>{tab === 'outstanding' ? '✅' : '💳'}</Text>
          <Text style={styles.emptyText}>
            {tab === 'outstanding'
              ? 'No outstanding payments. All subs are paid up.'
              : 'No completed payouts yet.'}
          </Text>
        </View>
      )}

      {/* Payment rows */}
      {display.map(r => (
        <TouchableOpacity
          key={r.id}
          style={styles.card}
          onPress={() => router.push({ pathname: '/(contractor)/jobs/[id]', params: { id: r.job_id } } as any)}
        >
          <View style={styles.cardTop}>
            <View style={styles.flex}>
              <Text style={styles.cardTitle} numberOfLines={1}>{r.job?.title ?? 'Job'}</Text>
              <Text style={styles.cardSub}>
                {r.job?.city}, {r.job?.state}  ·  {r.sub?.display_name ?? 'Subcontractor'}
              </Text>
            </View>
            <View style={styles.cardRight}>
              <Text style={styles.cardAmount}>{fmtExact(Number(r.sub_payout ?? 0))}</Text>
              <StatusBadge status={r.status} />
            </View>
          </View>
          <View style={styles.cardFooter}>
            <Text style={styles.cardDate}>
              {tab === 'paid' && r.paid_out_at
                ? `Paid ${timeAgo(r.paid_out_at)}`
                : `Created ${timeAgo(r.created_at)}`}
            </Text>
            {Number(r.platform_fee_contractor ?? 0) > 0 && (
              <Text style={styles.cardFee}>
                +{fmtExact(Number(r.platform_fee_contractor))} platform fee
              </Text>
            )}
          </View>
        </TouchableOpacity>
      ))}

      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={[styles.statCard, accent && styles.statCardAccent]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent && styles.statValueAccent]}>{value}</Text>
    </View>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { bg: string; text: string; label: string }> = {
    held:       { bg: '#fef3c7', text: '#92400e', label: 'Held' },
    processing: { bg: '#ede9fe', text: '#6d28d9', label: 'Processing' },
    pending:    { bg: '#dbeafe', text: '#1d4ed8', label: 'Pending' },
    released:   { bg: '#dcfce7', text: '#166534', label: 'Released' },
  };
  const c = configs[status] ?? { bg: colors.surface, text: colors.textMuted, label: status };
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.text }]}>{c.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  loader: { flex: 1, marginTop: spacing.xxl },

  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statCard: {
    flex: 1, backgroundColor: colors.background, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs,
  },
  statCardAccent: { backgroundColor: '#fef3c7', borderColor: '#fcd34d' },
  statLabel: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '600' },
  statValue: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text },
  statValueAccent: { color: '#92400e' },

  tabs: {
    flexDirection: 'row', backgroundColor: colors.background,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },
  tabBtn: { flex: 1, paddingVertical: spacing.sm + 2, alignItems: 'center' },
  tabBtnOn: { backgroundColor: colors.primary },
  tabText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '600' },
  tabTextOn: { color: colors.white },

  empty: {
    alignItems: 'center', paddingVertical: spacing.xxl,
    gap: spacing.md, backgroundColor: colors.background,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  emptyIcon: { fontSize: 44 },
  emptyText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },

  card: {
    backgroundColor: colors.background, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flex: { flex: 1 },
  cardTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  cardSub: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  cardRight: { alignItems: 'flex-end', gap: spacing.xs },
  cardAmount: { fontSize: fontSize.md, fontWeight: '800', color: colors.text },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  cardDate: { fontSize: fontSize.xs, color: colors.textMuted },
  cardFee: { fontSize: fontSize.xs, color: colors.textMuted },

  badge: {
    borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3,
  },
  badgeText: { fontSize: fontSize.xs, fontWeight: '700' },
});
