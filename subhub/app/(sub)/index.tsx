import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  TouchableOpacity, TextInput, ScrollView, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import FlipJobCard from '@/components/FlipJobCard';
import { DEMO_JOBS } from '@/lib/demo';
import { getSavedJobIds, saveJob, unsaveJob } from '@/lib/savedJobs';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import type { Job } from '@/lib/types';

type SortKey = 'payout' | 'duration' | 'newest';
type DurationFilter = 'all' | '1-2' | '3-5' | '6+';
type PayFilter = 'all' | 'under1k' | '1k-2.5k' | '2.5k-5k' | '5k+';

const SORTS: { label: string; value: SortKey }[] = [
  { label: '💰 Pay', value: 'payout' },
  { label: '📅 Days', value: 'duration' },
  { label: '🆕 Newest', value: 'newest' },
];

const INDUSTRIES = ['All', 'Fencing', 'Decking', 'Pergola / Shade', 'Gates', 'Retaining Walls', 'General'];

const DURATIONS: { label: string; value: DurationFilter }[] = [
  { label: 'Any', value: 'all' },
  { label: '1–2 days', value: '1-2' },
  { label: '3–5 days', value: '3-5' },
  { label: '6+ days', value: '6+' },
];

const PAY_BRACKETS: { label: string; value: PayFilter }[] = [
  { label: 'Any pay', value: 'all' },
  { label: '< $1k', value: 'under1k' },
  { label: '$1k–$2.5k', value: '1k-2.5k' },
  { label: '$2.5k–$5k', value: '2.5k-5k' },
  { label: '$5k+', value: '5k+' },
];

function matchesDuration(days: number, f: DurationFilter) {
  if (f === '1-2') return days <= 2;
  if (f === '3-5') return days >= 3 && days <= 5;
  if (f === '6+') return days >= 6;
  return true;
}

function matchesPay(payout: number, f: PayFilter) {
  if (f === 'under1k') return payout < 1000;
  if (f === '1k-2.5k') return payout >= 1000 && payout < 2500;
  if (f === '2.5k-5k') return payout >= 2500 && payout < 5000;
  if (f === '5k+') return payout >= 5000;
  return true;
}

function payFilterMin(f: PayFilter): number | null {
  if (f === 'under1k') return null;
  if (f === '1k-2.5k') return 1000;
  if (f === '2.5k-5k') return 2500;
  if (f === '5k+') return 5000;
  return null;
}

type PendingInvite = {
  id: string;
  status: string;
  job: { id: string; title: string; sub_payout: number } | null;
};

export default function JobBoardScreen() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [sort, setSort] = useState<SortKey>('newest');
  const [search, setSearch] = useState('');
  const [industry, setIndustry] = useState('All');
  const [duration, setDuration] = useState<DurationFilter>('all');
  const [pay, setPay] = useState<PayFilter>('all');
  const [loading, setLoading] = useState(true);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [invitesDismissed, setInvitesDismissed] = useState(false);
  const [subProfileId, setSubProfileId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [passedIds, setPassedIds] = useState<Set<string>>(new Set());
  const [showSavedOnly, setShowSavedOnly] = useState(false);

  useEffect(() => { fetchJobs(); fetchInvites(); fetchSaved(); }, []);

  async function fetchSaved() {
    try { setSavedIds(await getSavedJobIds()); } catch { /* not signed in / demo */ }
  }

  async function fetchJobs() {
    const { data } = await supabase
      .from('jobs')
      .select('*, contractor:contractor_profiles(business_name, rating, rating_count)')
      .eq('status', 'posted')
      .order('created_at', { ascending: false });
    // Demo jobs ride alongside real listings so the board is never empty in
    // concept mode. They sort in by created_at like anything else.
    setJobs([...(data ?? []), ...DEMO_JOBS]);
    setLoading(false);
  }

  async function fetchInvites() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const { data: prof } = await supabase
      .from('sub_profiles').select('id').eq('user_id', user.id).single();
    if (!prof) return;
    setSubProfileId(prof.id);

    const { data } = await supabase
      .from('job_invites')
      .select('id, status, job:jobs(id, title, sub_payout)')
      .eq('sub_id', prof.id)
      .eq('status', 'pending');

    setInvites((data as unknown as PendingInvite[]) ?? []);
  }

  async function acceptInvite(inviteId: string, jobId: string) {
    if (!userId) return;
    await supabase.from('jobs').update({
      status: 'claimed',
      claimed_by: userId,
      claimed_at: new Date().toISOString(),
    }).eq('id', jobId);
    await supabase.from('job_invites').update({ status: 'accepted' }).eq('id', inviteId);
    await fetchInvites();
    await fetchJobs();
    router.push(`/(sub)/jobs/${jobId}`);
  }

  async function declineInvite(inviteId: string) {
    await supabase.from('job_invites').update({ status: 'declined' }).eq('id', inviteId);
    await fetchInvites();
  }

  function handleSave(id: string) {
    setSavedIds(prev => new Set([...prev, id]));
    if (!id.startsWith('demo-')) saveJob(id).catch(() => {});
  }

  function handlePass(id: string) {
    setPassedIds(prev => new Set([...prev, id]));
  }

  // Double-tap toggles save (and persists for real jobs).
  function handleToggleSave(id: string, next: boolean) {
    setSavedIds(prev => {
      const s = new Set(prev);
      if (next) s.add(id); else s.delete(id);
      return s;
    });
    if (id.startsWith('demo-')) return;
    (next ? saveJob(id) : unsaveJob(id)).catch(() => {});
  }

  async function saveCurrentSearch() {
    if (!subProfileId) {
      Alert.alert('Not ready', 'Could not load your profile. Try again in a moment.');
      return;
    }
    const skills = industry === 'All' ? [] : [industry];
    const min_payout = payFilterMin(pay);
    const labelParts = [
      industry === 'All' ? 'All trades' : industry,
      pay === 'all' ? null : PAY_BRACKETS.find(p => p.value === pay)?.label,
    ].filter(Boolean);

    await supabase.from('saved_searches').insert({
      sub_id: subProfileId,
      label: labelParts.join(' · ') || null,
      skills,
      zip: null,
      min_payout,
      notify: true,
    });

    Alert.alert('Alert saved', "We'll notify you when matching jobs are posted. Manage your alerts anytime under Job Alerts.");
  }

  const filtered = jobs
    .filter(j =>
      !passedIds.has(j.id) &&
      (!showSavedOnly || savedIds.has(j.id)) &&
      (!search || j.title.toLowerCase().includes(search.toLowerCase()) || j.city.toLowerCase().includes(search.toLowerCase())) &&
      (industry === 'All' || j.industry === industry) &&
      matchesDuration(j.estimated_days, duration) &&
      matchesPay(j.sub_payout, pay)
    )
    .sort((a, b) => {
      // Boosted jobs always rise to the top, regardless of the chosen sort.
      if (!!a.boosted !== !!b.boosted) return a.boosted ? -1 : 1;
      if (sort === 'payout') return b.sub_payout - a.sub_payout;
      if (sort === 'duration') return a.estimated_days - b.estimated_days;
      return 0;
    });

  const activeFilters = (industry !== 'All' ? 1 : 0) + (duration !== 'all' ? 1 : 0) + (pay !== 'all' ? 1 : 0);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TextInput
          style={styles.search}
          placeholder="Search by title or city..."
          placeholderTextColor={colors.textLight}
          value={search}
          onChangeText={setSearch}
        />

        <FilterRow label="Trade">
          {INDUSTRIES.map(ind => (
            <Chip key={ind} label={ind} active={industry === ind} onPress={() => setIndustry(ind)} />
          ))}
        </FilterRow>

        <FilterRow label="Length">
          {DURATIONS.map(d => (
            <Chip key={d.value} label={d.label} active={duration === d.value} onPress={() => setDuration(d.value)} />
          ))}
        </FilterRow>

        <FilterRow label="Pay">
          {PAY_BRACKETS.map(p => (
            <Chip key={p.value} label={p.label} active={pay === p.value} onPress={() => setPay(p.value)} />
          ))}
        </FilterRow>

        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>Sort:</Text>
          {SORTS.map(s => (
            <TouchableOpacity
              key={s.value}
              style={[styles.sortChip, sort === s.value && styles.sortChipActive]}
              onPress={() => setSort(s.value)}
            >
              <Text style={[styles.sortText, sort === s.value && styles.sortTextActive]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
          {activeFilters > 0 && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => { setIndustry('All'); setDuration('all'); setPay('all'); }}
            >
              <Text style={styles.clearText}>Clear filters ({activeFilters})</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.alertRow}>
          <TouchableOpacity style={styles.saveSearchBtn} onPress={saveCurrentSearch}>
            <Text style={styles.saveSearchText}>🔔 Save this search</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(sub)/saved-searches' as any)}>
            <Text style={styles.manageAlertsText}>Manage alerts</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.accent} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={j => j.id}
          renderItem={({ item }) => (
            <FlipJobCard
              job={item}
              saved={savedIds.has(item.id)}
              onViewDetail={() => router.push(`/(sub)/jobs/${item.id}`)}
              onSave={handleSave}
              onPass={handlePass}
              onToggleSave={handleToggleSave}
            />
          )}
          ListHeaderComponent={
            <View>
              {!invitesDismissed && invites.length > 0 && (
                <View style={styles.inviteBanner}>
                  <View style={styles.inviteHeader}>
                    <Text style={styles.inviteTitle}>📨 You have {invites.length} job invitation{invites.length !== 1 ? 's' : ''}</Text>
                    <TouchableOpacity onPress={() => setInvitesDismissed(true)} hitSlop={8}>
                      <Text style={styles.inviteDismiss}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  {invites.map(inv => (
                    <View key={inv.id} style={styles.inviteCard}>
                      <View style={styles.inviteInfo}>
                        <Text style={styles.inviteJobTitle} numberOfLines={1}>{inv.job?.title ?? 'Job'}</Text>
                        <Text style={styles.invitePayout}>${(inv.job?.sub_payout ?? 0).toLocaleString()}</Text>
                      </View>
                      <View style={styles.inviteActions}>
                        <TouchableOpacity
                          style={styles.acceptBtn}
                          onPress={() => inv.job && acceptInvite(inv.id, inv.job.id)}
                        >
                          <Text style={styles.acceptText}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.declineBtn}
                          onPress={() => declineInvite(inv.id)}
                        >
                          <Text style={styles.declineText}>Decline</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
              <View style={styles.countRow}>
                <Text style={styles.count}>
                  {filtered.length} job{filtered.length !== 1 ? 's' : ''} {showSavedOnly ? 'saved' : 'available'}
                </Text>
                {savedIds.size > 0 && (
                  <TouchableOpacity onPress={() => setShowSavedOnly(v => !v)}>
                    <Text style={[styles.savedCount, showSavedOnly && styles.savedCountActive]}>
                      {showSavedOnly ? '← All jobs' : `💚 ${savedIds.size} saved`}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyText}>No jobs match your filters.</Text>
            </View>
          }
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.filterRow}>
      <Text style={styles.filterLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {children}
      </ScrollView>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  topBar: {
    backgroundColor: colors.background, padding: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.sm,
  },
  search: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.sm, fontSize: fontSize.md, color: colors.text, backgroundColor: colors.surface,
  },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  filterLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted, width: 56, textTransform: 'uppercase' },
  chipRow: { flexDirection: 'row', gap: spacing.xs },
  chip: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
  chipTextActive: { color: colors.white },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  sortLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  sortChip: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  sortChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  sortText: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
  sortTextActive: { color: colors.white },
  clearButton: { marginLeft: 'auto' as any },
  clearText: { fontSize: fontSize.xs, color: colors.error, fontWeight: '600' },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  saveSearchBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: 999,
    borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentLight,
  },
  saveSearchText: { fontSize: fontSize.xs, color: colors.accent, fontWeight: '700' },
  manageAlertsText: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600', textDecorationLine: 'underline' },
  inviteBanner: {
    margin: spacing.md, marginBottom: 0, padding: spacing.md,
    backgroundColor: colors.accentLight, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.accent, gap: spacing.sm,
  },
  inviteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  inviteTitle: { fontSize: fontSize.sm, fontWeight: '800', color: colors.text, flex: 1, paddingRight: spacing.sm },
  inviteDismiss: { fontSize: fontSize.md, color: colors.textMuted, fontWeight: '700' },
  inviteCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.background, borderRadius: radius.sm, padding: spacing.sm, gap: spacing.sm,
  },
  inviteInfo: { flex: 1 },
  inviteJobTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  invitePayout: { fontSize: fontSize.sm, fontWeight: '800', color: colors.accent },
  inviteActions: { flexDirection: 'row', gap: spacing.xs },
  acceptBtn: { backgroundColor: colors.accent, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  acceptText: { color: colors.white, fontSize: fontSize.xs, fontWeight: '700' },
  declineBtn: { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border },
  declineText: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '700' },
  loader: { marginTop: spacing.xxl },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  count: { fontSize: fontSize.sm, color: colors.textMuted },
  savedCount: { fontSize: fontSize.sm, color: colors.accent, fontWeight: '700' },
  savedCountActive: { color: colors.primary },
  list: { paddingBottom: spacing.xxl },
  empty: { alignItems: 'center', padding: spacing.xxl, gap: spacing.md },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: fontSize.md, color: colors.textMuted, textAlign: 'center' },
});
