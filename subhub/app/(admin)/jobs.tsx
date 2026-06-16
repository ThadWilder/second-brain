import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';

const STATUSES = ['all', 'posted', 'claimed', 'in_progress', 'pending_review', 'complete', 'disputed'];

const STATUS_LABELS: Record<string, string> = {
  all: 'All', posted: 'Posted', claimed: 'Claimed',
  in_progress: 'In Progress', pending_review: 'Review',
  complete: 'Complete', disputed: 'Disputed',
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  posted:         { bg: '#dbeafe', text: '#1d4ed8' },
  claimed:        { bg: '#fef3c7', text: '#92400e' },
  in_progress:    { bg: '#ede9fe', text: '#6d28d9' },
  pending_review: { bg: '#fce7f3', text: '#9d174d' },
  complete:       { bg: '#dcfce7', text: '#15803d' },
  disputed:       { bg: '#fee2e2', text: '#b91c1c' },
  draft:          { bg: '#f1f5f9', text: '#64748b' },
};

export default function AdminJobs() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    const { data } = await supabase
      .from('jobs')
      .select('*, contractor:contractor_profiles(business_name), sub:sub_profiles!claimed_by(name)')
      .order('created_at', { ascending: false });
    setJobs(data ?? []);
    setLoading(false);
  }

  const filtered = filter === 'all' ? jobs : jobs.filter(j => j.status === filter);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#1a3c5e" />;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.pageTitle}>Jobs</Text>
      <Text style={s.pageCount}>{filtered.length} job{filtered.length !== 1 ? 's' : ''}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterBar}>
        {STATUSES.map(st => (
          <TouchableOpacity
            key={st}
            style={[s.chip, filter === st && s.chipActive]}
            onPress={() => setFilter(st)}
          >
            <Text style={[s.chipText, filter === st && s.chipTextActive]}>{STATUS_LABELS[st]}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={s.table}>
        <View style={[s.row, s.head]}>
          <Text style={[s.cell, s.c1, s.headText]}>Job</Text>
          <Text style={[s.cell, s.c2, s.headText]}>Contractor</Text>
          <Text style={[s.cell, s.c2, s.headText]}>Sub</Text>
          <Text style={[s.cell, s.c3, s.headText]}>Status</Text>
          <Text style={[s.cell, s.c4, s.headText]}>Payout</Text>
          <Text style={[s.cell, s.c4, s.headText]}>Posted</Text>
        </View>
        {filtered.map(job => {
          const sc = STATUS_COLORS[job.status] ?? STATUS_COLORS.draft;
          return (
            <View key={job.id} style={s.row}>
              <View style={[s.cell, s.c1]}>
                <Text style={s.jobTitle} numberOfLines={1}>{job.title}</Text>
                <Text style={s.jobMeta}>{job.industry} · {job.city}, {job.state}</Text>
              </View>
              <Text style={[s.cell, s.c2, s.cellText]} numberOfLines={1}>
                {job.contractor?.business_name ?? '—'}
              </Text>
              <Text style={[s.cell, s.c2, s.cellText]} numberOfLines={1}>
                {job.sub?.name ?? '—'}
              </Text>
              <View style={[s.cell, s.c3]}>
                <View style={[s.badge, { backgroundColor: sc.bg }]}>
                  <Text style={[s.badgeText, { color: sc.text }]}>{STATUS_LABELS[job.status] ?? job.status}</Text>
                </View>
              </View>
              <Text style={[s.cell, s.c4, s.payText]}>${job.sub_payout?.toLocaleString()}</Text>
              <Text style={[s.cell, s.c4, s.dateText]}>
                {new Date(job.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
            </View>
          );
        })}
        {filtered.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyText}>No jobs with status "{STATUS_LABELS[filter]}"</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 28, gap: 16 },
  pageTitle: { fontSize: 26, fontWeight: '800', color: '#1e293b' },
  pageCount: { fontSize: 13, color: '#64748b', marginTop: -12 },
  filterBar: { flexGrow: 0 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff', marginRight: 8 },
  chipActive: { backgroundColor: '#1a3c5e', borderColor: '#1a3c5e' },
  chipText: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  chipTextActive: { color: '#ffffff' },
  table: { backgroundColor: '#ffffff', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0' },
  head: { backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  headText: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' as any, letterSpacing: 0.5 },
  cell: { paddingHorizontal: 4 },
  c1: { flex: 3 }, c2: { flex: 2 }, c3: { flex: 1.5 }, c4: { flex: 1 },
  cellText: { fontSize: 13, color: '#1e293b' },
  jobTitle: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  jobMeta: { fontSize: 11, color: '#64748b' },
  payText: { fontSize: 13, fontWeight: '700', color: '#15803d' },
  dateText: { fontSize: 12, color: '#64748b' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' as any },
  badgeText: { fontSize: 11, fontWeight: '600' },
  empty: { padding: 32, alignItems: 'center' as any },
  emptyText: { fontSize: 14, color: '#94a3b8' },
});
