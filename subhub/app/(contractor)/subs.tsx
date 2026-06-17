import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import { tierMeta, scoreColor } from '@/lib/reputation';
import { notify } from '@/lib/notifications';
import RatingStars from '@/components/RatingStars';

export default function SubDirectory() {
  const [subs, setSubs] = useState<any[]>([]);
  const [reviews, setReviews] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  // Contractor context
  const [contractorId, setContractorId] = useState<string | null>(null);
  const [contractorUserId, setContractorUserId] = useState<string | null>(null);
  const [contractorName, setContractorName] = useState<string>('A contractor');

  // Favorites
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [favOnly, setFavOnly] = useState(false);
  const [availOnly, setAvailOnly] = useState(false);

  // Invite-to-job
  const [jobs, setJobs] = useState<any[] | null>(null);
  const [invitePicker, setInvitePicker] = useState<string | null>(null); // sub id with open picker

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    const { data: subData } = await supabase
      .from('sub_profiles')
      .select('id, user_id, name, service_area_zip, service_area_miles, skills, rating, rating_count, verified, bio, availability, job_success_score, tier, response_rate, jobs_completed')
      .order('rating', { ascending: false });
    setSubs(subData ?? []);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setContractorUserId(user.id);
      const { data: profile } = await supabase
        .from('contractor_profiles')
        .select('id, business_name')
        .eq('user_id', user.id)
        .single();
      if (profile) {
        setContractorId(profile.id);
        if (profile.business_name) setContractorName(profile.business_name);
        const { data: favs } = await supabase
          .from('favorites')
          .select('sub_id')
          .eq('contractor_id', profile.id);
        setFavorites(new Set((favs ?? []).map((f: any) => f.sub_id)));
      }
    }

    setLoading(false);
  }

  async function loadReviews(userId: string, subId: string) {
    if (reviews[subId]) { setExpanded(expanded === subId ? null : subId); return; }
    const { data } = await supabase
      .from('ratings')
      .select('stars, comment, tags, created_at')
      .eq('ratee_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);
    setReviews(r => ({ ...r, [subId]: data ?? [] }));
    setExpanded(subId);
  }

  async function toggleFavorite(subId: string) {
    if (!contractorId) return;
    const isFav = favorites.has(subId);
    // Optimistic update
    setFavorites(prev => {
      const next = new Set(prev);
      if (isFav) next.delete(subId); else next.add(subId);
      return next;
    });

    if (isFav) {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('contractor_id', contractorId)
        .eq('sub_id', subId);
      if (error) {
        // revert
        setFavorites(prev => new Set(prev).add(subId));
      }
    } else {
      const { error } = await supabase
        .from('favorites')
        .insert({ contractor_id: contractorId, sub_id: subId });
      if (error) {
        setFavorites(prev => {
          const next = new Set(prev);
          next.delete(subId);
          return next;
        });
      }
    }
  }

  async function ensureJobsLoaded(): Promise<any[]> {
    if (jobs) return jobs;
    if (!contractorUserId) return [];
    // jobs.contractor_id references the contractor's auth user id (see (contractor)/index.tsx)
    const { data } = await supabase
      .from('jobs')
      .select('id, title, sub_payout')
      .eq('contractor_id', contractorUserId)
      .in('status', ['posted', 'draft']);
    const list = data ?? [];
    setJobs(list);
    return list;
  }

  async function openInvitePicker(subId: string) {
    if (invitePicker === subId) { setInvitePicker(null); return; }
    const list = await ensureJobsLoaded();
    if (list.length === 0) {
      Alert.alert('No invitable jobs', 'You have no posted or draft jobs to invite to. Post a job first.');
      return;
    }
    setInvitePicker(subId);
  }

  async function sendInvite(sub: any, job: any) {
    if (!contractorId) return;
    setInvitePicker(null);
    try {
      const { error } = await supabase
        .from('job_invites')
        .insert({ job_id: job.id, contractor_id: contractorId, sub_id: sub.id, status: 'pending' });

      if (error) {
        // Likely unique(job_id, sub_id) conflict
        if (error.code === '23505') {
          Alert.alert('Already invited', `${sub.name} has already been invited to "${job.title}".`);
        } else {
          Alert.alert('Could not send invite', error.message);
        }
        return;
      }

      await notify.jobInvite(sub.user_id, contractorName, job.title, job.id);
      Alert.alert('Invite sent', `${sub.name} was invited to "${job.title}".`);
    } catch (e: any) {
      Alert.alert('Could not send invite', e?.message ?? 'Something went wrong.');
    }
  }

  let filtered = search.trim()
    ? subs.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.service_area_zip.startsWith(search)
      )
    : subs;
  if (favOnly) filtered = filtered.filter(s => favorites.has(s.id));
  if (availOnly) filtered = filtered.filter(s => s.availability === 'available');

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />;

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or ZIP code..."
          placeholderTextColor={colors.textLight}
        />
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, !favOnly && styles.filterChipActive]}
            onPress={() => setFavOnly(false)}
          >
            <Text style={[styles.filterText, !favOnly && styles.filterTextActive]}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, favOnly && styles.filterChipActive]}
            onPress={() => setFavOnly(true)}
          >
            <Text style={[styles.filterText, favOnly && styles.filterTextActive]}>★ Favorites</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, availOnly && styles.filterChipActive]}
            onPress={() => setAvailOnly(v => !v)}
          >
            <Text style={[styles.filterText, availOnly && styles.filterTextActive]}>Available only</Text>
          </TouchableOpacity>
        </View>
      </View>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No subcontractors found</Text>
          <Text style={styles.emptySub}>
            {favOnly
              ? 'You have not favorited any subs yet.'
              : 'Subs appear here once they sign up and complete onboarding.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const tier = tierMeta(item.tier);
            const isFav = favorites.has(item.id);
            const available = item.availability === 'available';
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name}>{item.name}</Text>
                      {item.verified && <Text style={styles.verified}>✓ Verified</Text>}
                    </View>
                    <RatingStars value={item.rating} count={item.rating_count} size="sm" />
                  </View>
                  <View style={styles.headerRight}>
                    <TouchableOpacity onPress={() => toggleFavorite(item.id)} hitSlop={8}>
                      <Text style={[styles.star, isFav && styles.starActive]}>
                        {isFav ? '★' : '☆'}
                      </Text>
                    </TouchableOpacity>
                    <Text style={styles.zip}>📍 {item.service_area_zip}</Text>
                  </View>
                </View>

                {/* Reputation row */}
                <View style={styles.repRow}>
                  <View style={[styles.tierPill, { backgroundColor: tier.color + '22', borderColor: tier.color }]}>
                    <Text style={[styles.tierText, { color: tier.color }]}>
                      {tier.emoji} {tier.label}
                    </Text>
                  </View>

                  {item.job_success_score != null && (
                    <View style={[styles.jssPill, { backgroundColor: scoreColor(item.job_success_score) }]}>
                      <Text style={styles.jssText}>JSS {item.job_success_score}</Text>
                    </View>
                  )}

                  <View style={styles.availPill}>
                    <View style={[styles.dot, { backgroundColor: available ? colors.accent : colors.textLight }]} />
                    <Text style={[styles.availText, { color: available ? colors.accent : colors.textMuted }]}>
                      {available ? 'Available' : 'Busy'}
                    </Text>
                  </View>

                  {item.jobs_completed > 0 && (
                    <Text style={styles.jobsDone}>{item.jobs_completed} jobs completed</Text>
                  )}
                </View>

                {item.bio ? (
                  <Text style={styles.bio} numberOfLines={2}>{item.bio}</Text>
                ) : null}

                <View style={styles.meta}>
                  <Text style={styles.metaText}>
                    Service radius: {item.service_area_miles} miles
                  </Text>
                  {item.skills?.length > 0 && (
                    <Text style={styles.metaText}>Skills: {item.skills.join(', ')}</Text>
                  )}
                </View>

                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.reviewsBtn}
                    onPress={() => loadReviews(item.user_id, item.id)}
                  >
                    <Text style={styles.reviewsBtnText}>
                      {expanded === item.id ? 'Hide Reviews ▲' : `View Reviews (${item.rating_count}) ▼`}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.inviteBtn}
                    onPress={() => openInvitePicker(item.id)}
                  >
                    <Text style={styles.inviteBtnText}>
                      📨 {invitePicker === item.id ? 'Cancel' : 'Invite to Job'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {invitePicker === item.id && (
                  <View style={styles.jobPicker}>
                    <Text style={styles.jobPickerTitle}>Select a job:</Text>
                    {(jobs ?? []).map(job => (
                      <TouchableOpacity
                        key={job.id}
                        style={styles.jobOption}
                        onPress={() => sendInvite(item, job)}
                      >
                        <Text style={styles.jobOptionTitle} numberOfLines={1}>{job.title}</Text>
                        {job.sub_payout != null && (
                          <Text style={styles.jobOptionPay}>${Number(job.sub_payout).toLocaleString()}</Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {expanded === item.id && (
                  <View style={styles.reviewList}>
                    {(reviews[item.id] ?? []).length === 0 ? (
                      <Text style={styles.noReviews}>No reviews yet.</Text>
                    ) : (
                      (reviews[item.id] ?? []).map((r, i) => (
                        <View key={i} style={styles.review}>
                          <View style={styles.reviewHeader}>
                            <RatingStars value={r.stars} size="sm" />
                            <Text style={styles.reviewDate}>
                              {new Date(r.created_at).toLocaleDateString([], { month: 'short', year: 'numeric' })}
                            </Text>
                          </View>
                          {r.tags?.length > 0 && (
                            <View style={styles.tagRow}>
                              {r.tags.map((t: string) => (
                                <View key={t} style={styles.tag}>
                                  <Text style={styles.tagText}>{t}</Text>
                                </View>
                              ))}
                            </View>
                          )}
                          {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
                        </View>
                      ))
                    )}
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchWrap: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.sm },
  search: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.sm, fontSize: fontSize.md, color: colors.text,
    backgroundColor: colors.surface,
  },
  filterRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  filterChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '500' },
  filterTextActive: { color: colors.white },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  emptySub: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  list: { padding: spacing.md, gap: spacing.md },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.lg, gap: spacing.sm,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  headerRight: { alignItems: 'flex-end', gap: spacing.xs },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  name: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  verified: {
    fontSize: fontSize.xs, color: colors.accent, fontWeight: '700',
    backgroundColor: '#dcfce7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  star: { fontSize: fontSize.xl, color: colors.textLight },
  starActive: { color: colors.warning },
  zip: { fontSize: fontSize.sm, color: colors.textMuted },

  repRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  tierPill: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.sm, paddingVertical: 2,
    borderRadius: radius.full, borderWidth: 1,
  },
  tierText: { fontSize: fontSize.xs, fontWeight: '700' },
  jssPill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  jssText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.white },
  availPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  availText: { fontSize: fontSize.xs, fontWeight: '600' },
  jobsDone: { fontSize: fontSize.xs, color: colors.textMuted },

  bio: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 20 },
  meta: { gap: 2 },
  metaText: { fontSize: fontSize.sm, color: colors.textMuted },

  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  reviewsBtn: { paddingVertical: spacing.xs },
  reviewsBtnText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },
  inviteBtn: {
    paddingVertical: spacing.xs, paddingHorizontal: spacing.md,
    backgroundColor: colors.primary, borderRadius: radius.full,
  },
  inviteBtnText: { fontSize: fontSize.sm, color: colors.white, fontWeight: '600' },

  jobPicker: {
    borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  jobPickerTitle: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  jobOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.sm, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm,
    gap: spacing.sm,
  },
  jobOptionTitle: { fontSize: fontSize.sm, color: colors.text, flex: 1 },
  jobOptionPay: { fontSize: fontSize.sm, color: colors.accent, fontWeight: '700' },

  reviewList: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, gap: spacing.sm },
  noReviews: { fontSize: fontSize.sm, color: colors.textMuted, fontStyle: 'italic' },
  review: { gap: spacing.xs },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewDate: { fontSize: fontSize.xs, color: colors.textLight },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    backgroundColor: '#eff6ff', borderRadius: 12,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  tagText: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600' },
  reviewComment: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 18 },
});
