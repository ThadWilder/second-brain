import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { supabase } from '@/lib/supabase';
import RatingStars from '@/components/RatingStars';
import JobCard from '@/components/JobCard';
import { getVouchesFor, getMyActiveVouches, addVouch, removeVouch, VOUCH_CAP } from '@/lib/vouches';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import type { Job, ContractorProfile } from '@/lib/types';

export default function ContractorDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const [contractor, setContractor] = useState<ContractorProfile | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [vouchCount, setVouchCount] = useState(0);
  const [iVouched, setIVouched] = useState(false);
  const [vouching, setVouching] = useState(false);
  const [coFlag, setCoFlag] = useState<{ frequency_pct: number; avg_delta_pct: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [id]);

  async function load() {
    const [{ data: c }, { data: j }, { data: r }, vouches, mine] = await Promise.all([
      supabase.from('contractor_profiles').select('*').eq('user_id', id).single(),
      supabase.from('jobs').select('*, contractor:contractor_profiles(business_name, rating, rating_count)')
        .eq('contractor_id', id).eq('status', 'posted').order('created_at', { ascending: false }),
      supabase.from('ratings').select('id, stars, comment, rehire, created_at').eq('ratee_id', id)
        .not('comment', 'is', null).order('created_at', { ascending: false }).limit(20),
      getVouchesFor(id).catch(() => []),
      getMyActiveVouches().catch(() => []),
    ]);
    setContractor(c as ContractorProfile);
    setJobs((j ?? []) as Job[]);
    setReviews(r ?? []);
    setVouchCount((vouches ?? []).length);
    setIVouched((mine ?? []).some(v => v.vouchee_id === id));
    setLoading(false);
    if (c) navigation.setOptions({ title: (c as any).business_name });

    // Change-order health (protects subs from chronic underscoping).
    const { data: metrics } = await supabase.rpc('contractor_change_metrics', { p_contractor: id });
    const m = Array.isArray(metrics) ? metrics[0] : metrics;
    if (m?.flagged) setCoFlag({ frequency_pct: m.frequency_pct, avg_delta_pct: m.avg_delta_pct });
  }

  async function toggleVouch() {
    setVouching(true);
    try {
      if (iVouched) { await removeVouch(id); setIVouched(false); setVouchCount(c => Math.max(0, c - 1)); }
      else { await addVouch(id); setIVouched(true); setVouchCount(c => c + 1); }
    } catch (e) {
      Alert.alert('Backed By', (e as Error).message);
    } finally {
      setVouching(false);
    }
  }

  if (loading) return <ActivityIndicator style={styles.loader} color={colors.accent} />;
  if (!contractor) return <Text style={styles.notFound}>Contractor not found.</Text>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.biz}>{(contractor as any).business_name}</Text>
        <RatingStars value={contractor.rating} count={contractor.rating_count} size="md" />
        {vouchCount > 0 && (
          <View style={styles.vouchPill}>
            <Text style={styles.vouchText}>🤝 Backed by {vouchCount} {vouchCount === 1 ? 'person' : 'people'}</Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.vouchBtn, iVouched && styles.vouchBtnOn]}
          onPress={toggleVouch}
          disabled={vouching}
        >
          {vouching
            ? <ActivityIndicator color={iVouched ? colors.white : colors.primary} size="small" />
            : <Text style={[styles.vouchBtnText, iVouched && styles.vouchBtnTextOn]}>
                {iVouched ? '✓ You back this contractor' : '🤝 Back this contractor'}
              </Text>}
        </TouchableOpacity>
        <Text style={styles.vouchHint}>
          A vouch is your personal endorsement (max {VOUCH_CAP}). It reflects on you if they underperform.
        </Text>
      </View>

      {coFlag && (
        <View style={styles.coFlag}>
          <Text style={styles.coFlagText}>
            ⚠️ Heads up: this contractor files change orders on {Math.round(coFlag.frequency_pct * 100)}% of jobs
            (avg {Math.round(coFlag.avg_delta_pct * 100)}% of job value). Read the scope carefully before claiming.
          </Text>
        </View>
      )}

      <View style={styles.rateCard}>
        <Text style={styles.rateTitle}>Pre-agreed fee schedule</Text>
        <View style={styles.rateGrid}>
          <Chip label="Delay" value={`$${contractor.delay_pay_rate_per_hour ?? 35}/hr`} />
          <Chip label="Add-on" value={`$${contractor.addon_pay_rate_per_lf ?? 15}/LF`} />
          <Chip label="Return trip" value={`$${contractor.return_trip_fee ?? 150}`} />
          <Chip label="Terms" value={`${contractor.payment_terms_days ?? 14}d`} />
        </View>
      </View>

      <Text style={styles.sectionTitle}>Open jobs ({jobs.length})</Text>
      {jobs.length === 0 ? (
        <Text style={styles.empty}>No open jobs right now.</Text>
      ) : jobs.map(j => (
        <JobCard key={j.id} job={j} variant="board" onPress={() => router.push(`/(sub)/jobs/${j.id}`)} />
      ))}

      <Text style={styles.sectionTitle}>Reviews ({reviews.length})</Text>
      {reviews.length === 0 ? (
        <Text style={styles.empty}>No written reviews yet.</Text>
      ) : reviews.map(r => (
        <View key={r.id} style={styles.review}>
          <View style={styles.reviewTop}>
            <Text style={styles.reviewStars}>{r.stars}★</Text>
            {r.rehire && <Text style={styles.rehire}>would rehire</Text>}
          </View>
          <Text style={styles.reviewComment}>"{r.comment}"</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={styles.chipValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { paddingVertical: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  loader: { marginTop: spacing.xxl },
  notFound: { textAlign: 'center', marginTop: spacing.xxl, color: colors.textMuted },
  hero: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  biz: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  vouchPill: { backgroundColor: '#eff6ff', borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 4 },
  vouchText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '700' },
  vouchBtn: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginTop: spacing.xs },
  vouchBtnOn: { backgroundColor: colors.primary },
  vouchBtnText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '700' },
  vouchBtnTextOn: { color: colors.white },
  vouchHint: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing.lg, lineHeight: 16 },
  coFlag: { backgroundColor: '#fef3c7', borderRadius: radius.md, padding: spacing.md, marginHorizontal: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.warning },
  coFlagText: { fontSize: fontSize.sm, color: '#78350f', lineHeight: 20 },
  rateCard: { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, marginHorizontal: spacing.md, gap: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.primary },
  rateTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },
  rateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { backgroundColor: colors.surface, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4, borderWidth: 1, borderColor: colors.border },
  chipLabel: { fontSize: 10, color: colors.textMuted },
  chipValue: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, paddingHorizontal: spacing.md, marginTop: spacing.sm },
  empty: { fontSize: fontSize.sm, color: colors.textMuted, fontStyle: 'italic', paddingHorizontal: spacing.md },
  review: { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, marginHorizontal: spacing.md, gap: 4 },
  reviewTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reviewStars: { fontSize: fontSize.md, fontWeight: '800', color: colors.warning },
  rehire: { fontSize: fontSize.xs, color: colors.accent, fontWeight: '600' },
  reviewComment: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20, fontStyle: 'italic' },
});
