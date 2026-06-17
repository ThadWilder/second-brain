import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, TextInput, Image } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';

type Resolution = 'resolved_paid' | 'resolved_cancelled' | 'resolved_split';

export default function AdminDisputes() {
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [adminId, setAdminId] = useState<string | null>(null);

  // Per-dispute UI state
  const [evidenceByDispute, setEvidenceByDispute] = useState<Record<string, any[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loadingEvidence, setLoadingEvidence] = useState<string | null>(null);

  useFocusEffect(useCallback(() => { load(); }, [showResolved]));

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    setAdminId(user?.id ?? null);

    let query = supabase
      .from('disputes')
      .select('*, job:jobs(id, title, sub_payout, contractor_id, claimed_by)')
      .order('created_at', { ascending: true });

    if (!showResolved) {
      query = query
        .neq('status', 'resolved_paid')
        .neq('status', 'resolved_cancelled')
        .neq('status', 'resolved_split');
    }

    const { data } = await query;
    setDisputes(data ?? []);
    setLoading(false);
  }

  async function toggleEvidence(disputeId: string) {
    const next = !expanded[disputeId];
    setExpanded(prev => ({ ...prev, [disputeId]: next }));
    if (next && !evidenceByDispute[disputeId]) {
      setLoadingEvidence(disputeId);
      const { data } = await supabase
        .from('dispute_evidence')
        .select('*')
        .eq('dispute_id', disputeId)
        .order('created_at');
      setEvidenceByDispute(prev => ({ ...prev, [disputeId]: data ?? [] }));
      setLoadingEvidence(null);
    }
  }

  async function resolve(dispute: any, resolution: Resolution) {
    const labels: Record<Resolution, string> = {
      resolved_paid: 'Pay Sub',
      resolved_cancelled: 'Cancel (no pay)',
      resolved_split: 'Split',
    };
    Alert.alert(
      `Resolve — ${labels[resolution]}`,
      'This finalizes the dispute and updates the job. Continue?',
      [
        { text: 'Back', style: 'cancel' },
        {
          text: 'Confirm',
          style: resolution === 'resolved_cancelled' ? 'destructive' : 'default',
          onPress: async () => {
            setActing(dispute.id);

            // Update the dispute row
            const { error: dErr } = await supabase
              .from('disputes')
              .update({
                status: resolution,
                resolution_note: (notes[dispute.id] ?? '').trim() || null,
                resolved_by: adminId,
                resolved_at: new Date().toISOString(),
              })
              .eq('id', dispute.id);

            if (dErr) { setActing(null); Alert.alert('Error', dErr.message); return; }

            // Update the job status: paid/split → complete, cancel → draft (unclaimed)
            const jobUpdate: Record<string, any> =
              resolution === 'resolved_cancelled'
                ? { status: 'draft', claimed_by: null, claimed_at: null }
                : { status: 'complete' };
            if (dispute.job?.id) {
              await supabase.from('jobs').update(jobUpdate).eq('id', dispute.job.id);
            }

            setActing(null);
            load();
          },
        },
      ]
    );
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#1a3c5e" />;

  const unresolvedCount = disputes.filter(d => d.status.startsWith('open') || d.status === 'under_review').length;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.pageTitle}>Disputes</Text>
      <View style={s.headerRow}>
        <Text style={s.pageCount}>
          {showResolved ? `${disputes.length} dispute${disputes.length !== 1 ? 's' : ''}` : `${unresolvedCount} unresolved`}
        </Text>
        <TouchableOpacity onPress={() => { setLoading(true); setShowResolved(v => !v); }}>
          <Text style={s.toggleText}>{showResolved ? 'Hide resolved' : 'Show resolved'}</Text>
        </TouchableOpacity>
      </View>

      {disputes.length === 0 && (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>✅</Text>
          <Text style={s.emptyTitle}>No {showResolved ? '' : 'open '}disputes</Text>
          <Text style={s.emptySub}>All jobs are running smoothly.</Text>
        </View>
      )}

      {disputes.map(dispute => {
        const job = dispute.job ?? {};
        const isResolved = ['resolved_paid', 'resolved_cancelled', 'resolved_split'].includes(dispute.status);
        const evidence = evidenceByDispute[dispute.id];
        return (
          <View key={dispute.id} style={[s.card, isResolved && s.cardResolved]}>
            <View style={s.cardHeader}>
              <View style={s.cardHeaderLeft}>
                <Text style={s.jobTitle}>{job.title ?? 'Untitled job'}</Text>
                <Text style={s.jobMeta}>
                  ${job.sub_payout?.toLocaleString() ?? '—'} payout · opened by {dispute.opener_role}
                </Text>
              </View>
              <Text style={s.disputeDate}>
                {new Date(dispute.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
            </View>

            <View style={[s.statusBadge, isResolved && s.statusBadgeResolved]}>
              <Text style={[s.statusBadgeText, isResolved && s.statusBadgeTextResolved]}>
                {dispute.status.replace(/_/g, ' ')}
              </Text>
            </View>

            {dispute.reason && (
              <View style={s.reasonBox}>
                <Text style={s.reasonLabel}>{dispute.opener_role}'s reason</Text>
                <Text style={s.reasonText}>"{dispute.reason}"</Text>
              </View>
            )}

            {dispute.resolution_note && (
              <View style={s.resolutionBox}>
                <Text style={s.resolutionLabel}>Resolution note</Text>
                <Text style={s.resolutionText}>{dispute.resolution_note}</Text>
              </View>
            )}

            <TouchableOpacity style={s.evidenceToggle} onPress={() => toggleEvidence(dispute.id)}>
              <Text style={s.evidenceToggleText}>
                {expanded[dispute.id] ? '▼ Hide evidence' : '▶ View evidence thread'}
              </Text>
            </TouchableOpacity>

            {expanded[dispute.id] && (
              <View style={s.evidenceThread}>
                {loadingEvidence === dispute.id && <ActivityIndicator color="#1a3c5e" />}
                {evidence && evidence.length === 0 && (
                  <Text style={s.evidenceEmpty}>No evidence submitted.</Text>
                )}
                {evidence && evidence.map((e: any) => (
                  <View key={e.id} style={s.evidenceItem}>
                    <Text style={s.evidenceRole}>{e.submitter_role}</Text>
                    {e.note ? <Text style={s.evidenceNote}>{e.note}</Text> : null}
                    {Array.isArray(e.photo_urls) && e.photo_urls.length > 0 && (
                      <View style={s.evidencePhotos}>
                        {e.photo_urls.map((url: string, i: number) => (
                          <Image key={i} source={{ uri: url }} style={s.evidencePhoto} />
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {!isResolved && (
              <>
                <TextInput
                  style={s.noteInput}
                  value={notes[dispute.id] ?? ''}
                  onChangeText={t => setNotes(prev => ({ ...prev, [dispute.id]: t }))}
                  placeholder="Resolution note (optional)"
                  placeholderTextColor="#94a3b8"
                  multiline
                />
                <View style={s.actions}>
                  <TouchableOpacity
                    style={[s.btn, s.btnPay, acting === dispute.id && s.btnDisabled]}
                    onPress={() => resolve(dispute, 'resolved_paid')}
                    disabled={acting === dispute.id}
                  >
                    <Text style={s.btnPayText}>Pay Sub</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.btn, s.btnSplit, acting === dispute.id && s.btnDisabled]}
                    onPress={() => resolve(dispute, 'resolved_split')}
                    disabled={acting === dispute.id}
                  >
                    <Text style={s.btnSplitText}>Split</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.btn, s.btnCancel, acting === dispute.id && s.btnDisabled]}
                    onPress={() => resolve(dispute, 'resolved_cancelled')}
                    disabled={acting === dispute.id}
                  >
                    <Text style={s.btnCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 28, gap: 16 },
  pageTitle: { fontSize: 26, fontWeight: '800', color: '#1e293b' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: -12 },
  pageCount: { fontSize: 13, color: '#64748b' },
  toggleText: { fontSize: 13, color: '#1a3c5e', fontWeight: '700' },
  empty: { alignItems: 'center' as any, padding: 60, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  emptySub: { fontSize: 14, color: '#64748b' },
  card: {
    backgroundColor: '#ffffff', borderRadius: 12, padding: 20, gap: 14,
    borderWidth: 1, borderColor: '#fecaca', borderLeftWidth: 4, borderLeftColor: '#ef4444',
    shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 2,
  },
  cardResolved: { borderColor: '#e2e8f0', borderLeftColor: '#94a3b8' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardHeaderLeft: { flex: 1, gap: 2 },
  jobTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  jobMeta: { fontSize: 13, color: '#64748b' },
  disputeDate: { fontSize: 12, color: '#94a3b8' },
  statusBadge: { alignSelf: 'flex-start', backgroundColor: '#fee2e2', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeResolved: { backgroundColor: '#e2e8f0' },
  statusBadgeText: { fontSize: 11, fontWeight: '700', color: '#b91c1c', textTransform: 'capitalize' as any },
  statusBadgeTextResolved: { color: '#475569' },
  reasonBox: { backgroundColor: '#fef2f2', borderRadius: 8, padding: 12, gap: 4 },
  reasonLabel: { fontSize: 11, fontWeight: '700', color: '#b91c1c', textTransform: 'capitalize' as any, letterSpacing: 0.5 },
  reasonText: { fontSize: 13, color: '#7f1d1d', fontStyle: 'italic' as any, lineHeight: 18 },
  resolutionBox: { backgroundColor: '#f1f5f9', borderRadius: 8, padding: 12, gap: 4 },
  resolutionLabel: { fontSize: 11, fontWeight: '700', color: '#475569', textTransform: 'uppercase' as any, letterSpacing: 0.5 },
  resolutionText: { fontSize: 13, color: '#334155', lineHeight: 18 },
  evidenceToggle: { paddingVertical: 4 },
  evidenceToggleText: { fontSize: 13, fontWeight: '700', color: '#1a3c5e' },
  evidenceThread: { gap: 8 },
  evidenceEmpty: { fontSize: 13, color: '#64748b', fontStyle: 'italic' as any },
  evidenceItem: { backgroundColor: '#f8fafc', borderRadius: 8, padding: 12, gap: 4, borderWidth: 1, borderColor: '#e2e8f0' },
  evidenceRole: { fontSize: 11, fontWeight: '700', color: '#1a3c5e', textTransform: 'capitalize' as any },
  evidenceNote: { fontSize: 13, color: '#1e293b', lineHeight: 18 },
  evidencePhotos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  evidencePhoto: { width: 64, height: 64, borderRadius: 8, backgroundColor: '#e2e8f0' },
  noteInput: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 12,
    fontSize: 13, color: '#1e293b', backgroundColor: '#f8fafc', minHeight: 56, textAlignVertical: 'top' as any,
  },
  actions: { flexDirection: 'row', gap: 10, paddingTop: 4 },
  btn: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' as any },
  btnPay: { backgroundColor: '#1a3c5e' },
  btnPayText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
  btnSplit: { borderWidth: 1, borderColor: '#1a3c5e', backgroundColor: '#ffffff' },
  btnSplitText: { fontSize: 13, fontWeight: '700', color: '#1a3c5e' },
  btnCancel: { borderWidth: 1, borderColor: '#fca5a5', backgroundColor: '#fff1f2' },
  btnCancelText: { fontSize: 13, fontWeight: '700', color: '#dc2626' },
  btnDisabled: { opacity: 0.4 },
});
