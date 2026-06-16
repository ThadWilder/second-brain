import { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function AdminPayments() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    const { data } = await supabase
      .from('payment_records')
      .select('*, job:jobs(title, city, state), contractor:contractor_profiles!contractor_id(business_name), sub:sub_profiles!sub_id(name)')
      .order('created_at', { ascending: false });
    setRecords(data ?? []);
    setLoading(false);
  }

  const released = records.filter(r => r.status === 'released');
  const held = records.filter(r => r.status === 'held');
  const totalRevenue = released.reduce((s, r) => s + (r.platform_fee_contractor ?? 0) + (r.platform_fee_sub ?? 0), 0);
  const totalHeld = held.reduce((s, r) => s + (r.sub_payout ?? 0), 0);
  const totalPaidOut = released.reduce((s, r) => s + (r.sub_payout ?? 0), 0);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#1a3c5e" />;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.pageTitle}>Payments</Text>

      <View style={s.summaryRow}>
        <SummaryCard label="Platform Revenue" value={`$${totalRevenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} color="#d97706" />
        <SummaryCard label="Total Paid to Subs" value={`$${totalPaidOut.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} color="#15803d" />
        <SummaryCard label="Held in Escrow" value={`$${totalHeld.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} color="#6d28d9" />
        <SummaryCard label="Total Transactions" value={records.length} color="#1a3c5e" />
      </View>

      <View style={s.table}>
        <View style={[s.row, s.head]}>
          <Text style={[s.cell, s.c2, s.headText]}>Job</Text>
          <Text style={[s.cell, s.c2, s.headText]}>Contractor</Text>
          <Text style={[s.cell, s.c2, s.headText]}>Sub</Text>
          <Text style={[s.cell, s.c1, s.headText]}>Payout</Text>
          <Text style={[s.cell, s.c1, s.headText]}>Platform Fee</Text>
          <Text style={[s.cell, s.c1, s.headText]}>Status</Text>
          <Text style={[s.cell, s.c1, s.headText]}>Date</Text>
        </View>
        {records.map(r => {
          const fee = (r.platform_fee_contractor ?? 0) + (r.platform_fee_sub ?? 0);
          const statusColor = r.status === 'released'
            ? { bg: '#dcfce7', text: '#15803d' }
            : r.status === 'held'
            ? { bg: '#ede9fe', text: '#6d28d9' }
            : { bg: '#f1f5f9', text: '#64748b' };
          return (
            <View key={r.id} style={s.row}>
              <View style={[s.cell, s.c2]}>
                <Text style={s.jobTitle} numberOfLines={1}>{r.job?.title ?? '—'}</Text>
                <Text style={s.jobMeta}>{r.job?.city}, {r.job?.state}</Text>
              </View>
              <Text style={[s.cell, s.c2, s.cellText]} numberOfLines={1}>
                {r.contractor?.business_name ?? '—'}
              </Text>
              <Text style={[s.cell, s.c2, s.cellText]} numberOfLines={1}>
                {r.sub?.name ?? '—'}
              </Text>
              <Text style={[s.cell, s.c1, s.payText]}>${r.sub_payout?.toLocaleString()}</Text>
              <Text style={[s.cell, s.c1, s.feeText]}>${fee.toFixed(2)}</Text>
              <View style={[s.cell, s.c1]}>
                <View style={[s.badge, { backgroundColor: statusColor.bg }]}>
                  <Text style={[s.badgeText, { color: statusColor.text }]}>{r.status}</Text>
                </View>
              </View>
              <Text style={[s.cell, s.c1, s.dateText]}>
                {r.paid_out_at
                  ? new Date(r.paid_out_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
            </View>
          );
        })}
        {records.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyText}>No payment records yet.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <View style={s.summaryCard}>
      <Text style={[s.summaryValue, { color }]}>{value}</Text>
      <Text style={s.summaryLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 28, gap: 16 },
  pageTitle: { fontSize: 26, fontWeight: '800', color: '#1e293b' },
  summaryRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' as any },
  summaryCard: {
    flex: 1, minWidth: 140, backgroundColor: '#ffffff', borderRadius: 12, padding: 18,
    shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 2,
  },
  summaryValue: { fontSize: 26, fontWeight: '800' },
  summaryLabel: { fontSize: 12, color: '#64748b', marginTop: 4, fontWeight: '500' },
  table: { backgroundColor: '#ffffff', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0' },
  head: { backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  headText: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' as any, letterSpacing: 0.5 },
  cell: { paddingHorizontal: 4 },
  c1: { flex: 1 }, c2: { flex: 2 },
  jobTitle: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  jobMeta: { fontSize: 11, color: '#64748b' },
  cellText: { fontSize: 13, color: '#1e293b' },
  payText: { fontSize: 13, fontWeight: '700', color: '#15803d' },
  feeText: { fontSize: 13, fontWeight: '600', color: '#d97706' },
  dateText: { fontSize: 12, color: '#64748b' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' as any },
  badgeText: { fontSize: 11, fontWeight: '600' },
  empty: { padding: 32, alignItems: 'center' as any },
  emptyText: { fontSize: 14, color: '#94a3b8' },
});
