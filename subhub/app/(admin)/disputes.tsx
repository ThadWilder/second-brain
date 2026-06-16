import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function AdminDisputes() {
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    const { data } = await supabase
      .from('jobs')
      .select('*, contractor:contractor_profiles(business_name, contact_name, phone_number), sub:sub_profiles!claimed_by(name, phone_number)')
      .eq('status', 'disputed')
      .order('created_at', { ascending: false });
    setDisputes(data ?? []);
    setLoading(false);
  }

  async function cancelJob(jobId: string) {
    Alert.alert(
      'Cancel Job',
      'This will cancel the job and return it to draft status. The sub will not be paid. Are you sure?',
      [
        { text: 'Back', style: 'cancel' },
        {
          text: 'Cancel Job',
          style: 'destructive',
          onPress: async () => {
            setActing(jobId);
            const { data, error } = await supabase.functions.invoke('admin-action', {
              body: { action: 'cancel_job', jobId },
            });
            setActing(null);
            if (error || data?.error) { Alert.alert('Error', data?.error ?? error?.message); return; }
            load();
          },
        },
      ]
    );
  }

  async function resolveDispute(jobId: string) {
    Alert.alert(
      'Mark Resolved',
      'This marks the job as complete. Use this when the dispute has been resolved off-platform and payment should be released.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Complete',
          onPress: async () => {
            setActing(jobId);
            const { data, error } = await supabase.functions.invoke('admin-action', {
              body: { action: 'resolve_dispute', jobId },
            });
            setActing(null);
            if (error || data?.error) { Alert.alert('Error', data?.error ?? error?.message); return; }
            load();
          },
        },
      ]
    );
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#1a3c5e" />;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.pageTitle}>Disputes</Text>
      <Text style={s.pageCount}>{disputes.length} open dispute{disputes.length !== 1 ? 's' : ''}</Text>

      {disputes.length === 0 && (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>✅</Text>
          <Text style={s.emptyTitle}>No open disputes</Text>
          <Text style={s.emptySub}>All jobs are running smoothly.</Text>
        </View>
      )}

      {disputes.map(job => (
        <View key={job.id} style={s.card}>
          <View style={s.cardHeader}>
            <View style={s.cardHeaderLeft}>
              <Text style={s.jobTitle}>{job.title}</Text>
              <Text style={s.jobMeta}>{job.industry} · {job.city}, {job.state} · ${job.sub_payout?.toLocaleString()} payout</Text>
            </View>
            <Text style={s.disputeDate}>
              {new Date(job.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Text>
          </View>

          {(job as any).dispute_reason && (
            <View style={s.reasonBox}>
              <Text style={s.reasonLabel}>Contractor's reason</Text>
              <Text style={s.reasonText}>"{(job as any).dispute_reason}"</Text>
            </View>
          )}

          <View style={s.partiesRow}>
            <View style={s.party}>
              <Text style={s.partyRole}>Contractor</Text>
              <Text style={s.partyName}>{job.contractor?.business_name ?? '—'}</Text>
              {job.contractor?.contact_name && <Text style={s.partySub}>{job.contractor.contact_name}</Text>}
            </View>
            <View style={s.partyDivider} />
            <View style={s.party}>
              <Text style={s.partyRole}>Sub</Text>
              <Text style={s.partyName}>{job.sub?.name ?? '—'}</Text>
            </View>
          </View>

          <View style={s.actions}>
            <TouchableOpacity
              style={[s.btn, s.btnCancel, acting === job.id && s.btnDisabled]}
              onPress={() => cancelJob(job.id)}
              disabled={acting === job.id}
            >
              <Text style={s.btnCancelText}>Cancel Job</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btn, s.btnResolve, acting === job.id && s.btnDisabled]}
              onPress={() => resolveDispute(job.id)}
              disabled={acting === job.id}
            >
              <Text style={s.btnResolveText}>Mark Resolved</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 28, gap: 16 },
  pageTitle: { fontSize: 26, fontWeight: '800', color: '#1e293b' },
  pageCount: { fontSize: 13, color: '#64748b', marginTop: -12 },
  empty: { alignItems: 'center' as any, padding: 60, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  emptySub: { fontSize: 14, color: '#64748b' },
  card: {
    backgroundColor: '#ffffff', borderRadius: 12, padding: 20, gap: 14,
    borderWidth: 1, borderColor: '#fecaca', borderLeftWidth: 4, borderLeftColor: '#ef4444',
    shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardHeaderLeft: { flex: 1, gap: 2 },
  jobTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  jobMeta: { fontSize: 13, color: '#64748b' },
  disputeDate: { fontSize: 12, color: '#94a3b8' },
  reasonBox: { backgroundColor: '#fef2f2', borderRadius: 8, padding: 12, gap: 4 },
  reasonLabel: { fontSize: 11, fontWeight: '700', color: '#b91c1c', textTransform: 'uppercase' as any, letterSpacing: 0.5 },
  reasonText: { fontSize: 13, color: '#7f1d1d', fontStyle: 'italic' as any, lineHeight: 18 },
  partiesRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  party: { flex: 1, gap: 2 },
  partyRole: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' as any, letterSpacing: 0.5 },
  partyName: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  partySub: { fontSize: 12, color: '#64748b' },
  partyDivider: { width: 1, height: 36, backgroundColor: '#e2e8f0' },
  actions: { flexDirection: 'row', gap: 10, paddingTop: 4 },
  btn: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' as any },
  btnCancel: { borderWidth: 1, borderColor: '#fca5a5', backgroundColor: '#fff1f2' },
  btnCancelText: { fontSize: 13, fontWeight: '700', color: '#dc2626' },
  btnResolve: { backgroundColor: '#1a3c5e' },
  btnResolveText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
  btnDisabled: { opacity: 0.4 },
});
