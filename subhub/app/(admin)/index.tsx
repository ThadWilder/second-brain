import { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [recentJobs, setRecentJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    const [statsRes, jobsRes] = await Promise.all([
      supabase.functions.invoke('admin-action', { body: { action: 'get_stats' } }),
      supabase.from('jobs')
        .select('id, title, status, sub_payout, city, state, created_at, contractor:contractor_profiles(business_name)')
        .order('created_at', { ascending: false })
        .limit(8),
    ]);
    setStats(statsRes.data);
    setRecentJobs(jobsRes.data ?? []);
    setLoading(false);
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#1a3c5e" />;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.pageTitle}>Dashboard</Text>
      <Text style={s.pageDate}>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</Text>

      <View style={s.statGrid}>
        <StatCard label="Total Jobs" value={stats?.totalJobs ?? 0} color="#1a3c5e" />
        <StatCard label="Active Jobs" value={stats?.activeJobs ?? 0} color="#8b5cf6" />
        <StatCard label="Open Disputes" value={stats?.disputes ?? 0} color="#ef4444" onPress={() => router.push('/(admin)/disputes')} />
        <StatCard label="Contractors" value={stats?.totalContractors ?? 0} color="#0891b2" />
        <StatCard label="Subs" value={stats?.totalSubs ?? 0} color="#22c55e" />
        <StatCard label="Platform Revenue" value={`$${(stats?.totalRevenue ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`} color="#d97706" />
        <StatCard label="Pending Payouts" value={`$${(stats?.pendingPayout ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`} color="#64748b" />
      </View>

      <Text style={s.sectionTitle}>Recent Jobs</Text>
      <View style={s.table}>
        <View style={[s.tableRow, s.tableHead]}>
          <Text style={[s.cell, s.cellTitle, s.headText]}>Job</Text>
          <Text style={[s.cell, s.cellContractor, s.headText]}>Contractor</Text>
          <Text style={[s.cell, s.cellStatus, s.headText]}>Status</Text>
          <Text style={[s.cell, s.cellPay, s.headText]}>Payout</Text>
        </View>
        {recentJobs.map(job => (
          <TouchableOpacity key={job.id} style={s.tableRow} onPress={() => router.push('/(admin)/jobs')}>
            <View style={[s.cell, s.cellTitle]}>
              <Text style={s.jobTitle} numberOfLines={1}>{job.title}</Text>
              <Text style={s.jobLoc}>{job.city}, {job.state}</Text>
            </View>
            <Text style={[s.cell, s.cellContractor, s.cellText]} numberOfLines={1}>
              {(job.contractor as any)?.business_name ?? '—'}
            </Text>
            <View style={[s.cell, s.cellStatus]}>
              <StatusBadge status={job.status} />
            </View>
            <Text style={[s.cell, s.cellPay, s.payText]}>${job.sub_payout?.toLocaleString()}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

function StatCard({ label, value, color, onPress }: { label: string; value: any; color: string; onPress?: () => void }) {
  return (
    <TouchableOpacity style={s.statCard} onPress={onPress} disabled={!onPress} activeOpacity={onPress ? 0.7 : 1}>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function StatusBadge({ status }: { status: string }) {
  const MAP: Record<string, { bg: string; text: string; label: string }> = {
    posted:        { bg: '#dbeafe', text: '#1d4ed8', label: 'Posted' },
    claimed:       { bg: '#fef3c7', text: '#92400e', label: 'Claimed' },
    in_progress:   { bg: '#ede9fe', text: '#6d28d9', label: 'In Progress' },
    pending_review:{ bg: '#fce7f3', text: '#9d174d', label: 'Review' },
    complete:      { bg: '#dcfce7', text: '#15803d', label: 'Complete' },
    disputed:      { bg: '#fee2e2', text: '#b91c1c', label: 'Disputed' },
    draft:         { bg: '#f1f5f9', text: '#64748b', label: 'Draft' },
  };
  const c = MAP[status] ?? MAP.draft;
  return (
    <View style={[s.badge, { backgroundColor: c.bg }]}>
      <Text style={[s.badgeText, { color: c.text }]}>{c.label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 28, gap: 20 },
  pageTitle: { fontSize: 26, fontWeight: '800', color: '#1e293b' },
  pageDate: { fontSize: 13, color: '#64748b', marginTop: -12 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  statCard: {
    backgroundColor: '#ffffff', borderRadius: 12, padding: 18,
    minWidth: 140, flex: 1,
    shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 2,
  },
  statValue: { fontSize: 30, fontWeight: '800' },
  statLabel: { fontSize: 12, color: '#64748b', marginTop: 4, fontWeight: '500' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  table: { backgroundColor: '#ffffff', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0' },
  tableHead: { backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  headText: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 },
  cell: { paddingHorizontal: 4 },
  cellTitle: { flex: 3 },
  cellContractor: { flex: 2 },
  cellStatus: { flex: 1.5 },
  cellPay: { flex: 1, textAlign: 'right' as any },
  cellText: { fontSize: 13, color: '#1e293b' },
  jobTitle: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  jobLoc: { fontSize: 11, color: '#64748b' },
  payText: { fontSize: 13, fontWeight: '700', color: '#15803d' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' as any },
  badgeText: { fontSize: 11, fontWeight: '600' },
});
