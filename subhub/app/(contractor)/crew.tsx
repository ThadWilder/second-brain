import { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import RatingStars from '@/components/RatingStars';
import {
  getCrew, getCrewCandidates, addToCrew, removeFromCrew, getCrewSlots,
  CREW_MIN_JOBS, CREW_MIN_DOLLARS,
} from '@/lib/crew';
import type { CrewMember, CrewCandidate } from '@/lib/types';

function money(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export default function CrewScreen() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [candidates, setCandidates] = useState<CrewCandidate[]>([]);
  const [slots, setSlots] = useState({ used: 0, total: 3 });

  const load = useCallback(async () => {
    try {
      const [c, cand, s] = await Promise.all([getCrew(), getCrewCandidates(), getCrewSlots()]);
      setCrew(c);
      setCandidates(cand);
      setSlots(s);
    } catch (e) {
      Alert.alert('Could not load crew', (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  async function handleAdd(c: CrewCandidate) {
    setBusy(c.sub_id);
    try {
      await addToCrew(c.sub_id);
      await load();
    } catch (e) {
      Alert.alert('Could not add to crew', (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function handleRemove(m: CrewMember) {
    Alert.alert(
      'Remove from crew?',
      `${m.sub?.name ?? 'This sub'} will lose priority access to your new jobs. Their work history with you is kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive', onPress: async () => {
            setBusy(m.sub_id);
            try { await removeFromCrew(m.sub_id); await load(); }
            catch (e) { Alert.alert('Could not remove', (e as Error).message); }
            finally { setBusy(null); }
          },
        },
      ],
    );
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }

  const full = slots.used >= slots.total;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.primary} />}
    >
      {/* Slot meter */}
      <View style={styles.slotCard}>
        <View style={styles.flex}>
          <Text style={styles.slotTitle}>Your Crew</Text>
          <Text style={styles.slotSub}>
            {slots.used} of {slots.total} slots used{full ? ' — full' : ''}
          </Text>
        </View>
        <View style={styles.slotBadge}>
          <Text style={styles.slotBadgeText}>{slots.total - slots.used}</Text>
          <Text style={styles.slotBadgeLabel}>open</Text>
        </View>
      </View>

      <Text style={styles.intro}>
        Crew members get a head start — your new jobs are theirs to claim first, before
        the rest of the board sees them. A sub becomes eligible after {CREW_MIN_JOBS} completed
        jobs and {money(CREW_MIN_DOLLARS)} earned with you.
      </Text>

      {/* Eligible candidates */}
      {candidates.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ready to add</Text>
          {candidates.map(c => (
            <View key={c.sub_id} style={styles.row}>
              <View style={styles.flex}>
                <Text style={styles.name}>{c.sub?.name ?? 'Subcontractor'}</Text>
                {c.sub && <RatingStars value={c.sub.rating} count={c.sub.rating_count} size="sm" />}
                <Text style={styles.stats}>{c.jobs_together} jobs · {money(c.dollars_together)} together</Text>
              </View>
              <TouchableOpacity
                style={[styles.addBtn, full && styles.btnDisabled]}
                onPress={() => handleAdd(c)}
                disabled={full || busy === c.sub_id}
              >
                {busy === c.sub_id
                  ? <ActivityIndicator color={colors.white} />
                  : <Text style={styles.addBtnText}>{full ? 'No slots' : '+ Add'}</Text>}
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Current crew */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>On your crew</Text>
        {crew.length === 0 ? (
          <Text style={styles.empty}>
            No crew yet. Complete jobs with reliable subs and they'll show up here ready to add.
          </Text>
        ) : crew.map(m => (
          <View key={m.id} style={[styles.row, m.status === 'at_risk' && styles.rowAtRisk]}>
            <View style={styles.flex}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{m.sub?.name ?? 'Subcontractor'}</Text>
                {m.status === 'at_risk' && <View style={styles.riskBadge}><Text style={styles.riskBadgeText}>At risk</Text></View>}
              </View>
              {m.sub && <RatingStars value={m.sub.rating} count={m.sub.rating_count} size="sm" />}
              <Text style={styles.stats}>{m.jobs_together} jobs · {money(m.dollars_together)} together</Text>
            </View>
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => handleRemove(m)}
              disabled={busy === m.sub_id}
            >
              {busy === m.sub_id
                ? <ActivityIndicator color={colors.error} />
                : <Text style={styles.removeBtnText}>Remove</Text>}
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  flex: { flex: 1 },
  slotCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.lg,
  },
  slotTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.white },
  slotSub: { fontSize: fontSize.sm, color: '#cbd5e1', marginTop: 2 },
  slotBadge: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  slotBadgeText: { fontSize: fontSize.xl, fontWeight: '800', color: colors.white },
  slotBadgeLabel: { fontSize: fontSize.xs, color: '#cbd5e1' },
  intro: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 22 },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  rowAtRisk: { borderColor: colors.warning, backgroundColor: '#fffbeb' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  stats: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  addBtn: {
    backgroundColor: colors.accent, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, minWidth: 90, alignItems: 'center',
  },
  addBtnText: { color: colors.white, fontWeight: '700', fontSize: fontSize.sm },
  btnDisabled: { opacity: 0.4 },
  removeBtn: {
    borderWidth: 1, borderColor: colors.error, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minWidth: 90, alignItems: 'center',
  },
  removeBtnText: { color: colors.error, fontWeight: '600', fontSize: fontSize.sm },
  riskBadge: { backgroundColor: colors.warning, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  riskBadgeText: { color: colors.white, fontSize: fontSize.xs, fontWeight: '700' },
  empty: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 22, fontStyle: 'italic' },
});
