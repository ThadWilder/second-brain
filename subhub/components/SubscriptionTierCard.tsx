import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { TIER_INFO, setSubscriptionTier, type SubscriptionTier } from '@/lib/crew';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

// Subscription tiers unlock crew slots — the primary subscription monetization
// lever from the blueprint. Switching tier resets crew_slots server-side.
export default function SubscriptionTierCard() {
  const [tier, setTier] = useState<SubscriptionTier>('starter');
  const [used, setUsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<SubscriptionTier | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const [{ data: prof }, { count }] = await Promise.all([
      supabase.from('contractor_profiles').select('subscription_tier').eq('user_id', user.id).single(),
      supabase.from('crew_members').select('id', { count: 'exact', head: true })
        .eq('contractor_id', user.id).neq('status', 'removed'),
    ]);
    setTier((prof?.subscription_tier as SubscriptionTier) ?? 'starter');
    setUsed(count ?? 0);
    setLoading(false);
  }

  async function choose(next: SubscriptionTier) {
    if (next === tier) return;
    const downgrade = TIER_INFO[next].slots < TIER_INFO[tier].slots;
    if (downgrade && used > TIER_INFO[next].slots) {
      Alert.alert('Remove crew first',
        `You have ${used} crew members but ${TIER_INFO[next].label} allows only ${TIER_INFO[next].slots}. Remove some before downgrading.`);
      return;
    }
    setSaving(next);
    try { await setSubscriptionTier(next); setTier(next); }
    catch (e) { Alert.alert('Error', (e as Error).message); }
    finally { setSaving(null); }
  }

  if (loading) return <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Crew Plan</Text>
      <Text style={styles.body}>Higher tiers unlock more crew slots — your reliable bench with priority access.</Text>
      <View style={styles.row}>
        {(Object.keys(TIER_INFO) as SubscriptionTier[]).map(k => {
          const info = TIER_INFO[k];
          const active = k === tier;
          return (
            <TouchableOpacity key={k} style={[styles.tier, active && styles.tierActive]} onPress={() => choose(k)} disabled={!!saving}>
              {saving === k ? <ActivityIndicator color={colors.primary} /> : (
                <>
                  <Text style={[styles.tierName, active && styles.tierNameActive]}>{info.label}</Text>
                  <Text style={styles.slots}>{info.slots} slots</Text>
                  <Text style={styles.price}>{info.price}</Text>
                  {active && <Text style={styles.current}>Current</Text>}
                </>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.usage}>{used} of {TIER_INFO[tier].slots} slots in use</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  title: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  body: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 18 },
  row: { flexDirection: 'row', gap: spacing.sm },
  tier: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center', gap: 2, minHeight: 88, justifyContent: 'center' },
  tierActive: { borderColor: colors.primary, backgroundColor: '#eff6ff' },
  tierName: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  tierNameActive: { color: colors.primary },
  slots: { fontSize: fontSize.xs, color: colors.textMuted },
  price: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  current: { fontSize: 10, color: colors.primary, fontWeight: '700' },
  usage: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center' },
});
