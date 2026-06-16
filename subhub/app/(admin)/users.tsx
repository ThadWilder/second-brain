import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import RatingStars from '@/components/RatingStars';

export default function AdminUsers() {
  const [contractors, setContractors] = useState<any[]>([]);
  const [subs, setSubs] = useState<any[]>([]);
  const [tab, setTab] = useState<'contractors' | 'subs'>('contractors');
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    const [cRes, sRes] = await Promise.all([
      supabase.from('contractor_profiles')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase.from('sub_profiles')
        .select('*')
        .order('created_at', { ascending: false }),
    ]);
    setContractors(cRes.data ?? []);
    setSubs(sRes.data ?? []);
    setLoading(false);
  }

  async function toggleVerified(userId: string, current: boolean) {
    const { data, error } = await supabase.functions.invoke('admin-action', {
      body: { action: 'toggle_verified', subId: userId, verified: !current },
    });
    if (error || data?.error) {
      Alert.alert('Error', data?.error ?? error?.message);
      return;
    }
    load();
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#1a3c5e" />;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.pageTitle}>Users</Text>

      <View style={s.tabRow}>
        <TouchableOpacity style={[s.tab, tab === 'contractors' && s.tabActive]} onPress={() => setTab('contractors')}>
          <Text style={[s.tabText, tab === 'contractors' && s.tabTextActive]}>
            Contractors ({contractors.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, tab === 'subs' && s.tabActive]} onPress={() => setTab('subs')}>
          <Text style={[s.tabText, tab === 'subs' && s.tabTextActive]}>
            Subs ({subs.length})
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'contractors' && (
        <View style={s.table}>
          <View style={[s.row, s.head]}>
            <Text style={[s.cell, s.c1, s.headText]}>Business</Text>
            <Text style={[s.cell, s.c2, s.headText]}>Trades</Text>
            <Text style={[s.cell, s.c2, s.headText]}>Area</Text>
            <Text style={[s.cell, s.c1, s.headText]}>Rating</Text>
            <Text style={[s.cell, s.c1, s.headText]}>Stripe</Text>
            <Text style={[s.cell, s.c1, s.headText]}>Joined</Text>
          </View>
          {contractors.map(c => (
            <View key={c.id} style={s.row}>
              <View style={[s.cell, s.c1]}>
                <Text style={s.name}>{c.business_name}</Text>
                <Text style={s.sub}>{c.contact_name}</Text>
              </View>
              <Text style={[s.cell, s.c2, s.cellText]} numberOfLines={1}>
                {c.scope_of_work?.join(', ') ?? '—'}
              </Text>
              <Text style={[s.cell, s.c2, s.cellText]}>
                {c.service_area_miles} mi · {c.service_area_zip}
              </Text>
              <View style={[s.cell, s.c1]}>
                <RatingStars value={c.rating} count={c.rating_count} size="sm" />
              </View>
              <View style={[s.cell, s.c1]}>
                <View style={[s.pill, c.stripe_customer_id ? s.pillGreen : s.pillGray]}>
                  <Text style={[s.pillText, c.stripe_customer_id ? s.pillTextGreen : s.pillTextGray]}>
                    {c.stripe_customer_id ? 'Connected' : 'None'}
                  </Text>
                </View>
              </View>
              <Text style={[s.cell, s.c1, s.dateText]}>
                {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
              </Text>
            </View>
          ))}
        </View>
      )}

      {tab === 'subs' && (
        <View style={s.table}>
          <View style={[s.row, s.head]}>
            <Text style={[s.cell, s.c1, s.headText]}>Name</Text>
            <Text style={[s.cell, s.c2, s.headText]}>Skills</Text>
            <Text style={[s.cell, s.c1, s.headText]}>Rating</Text>
            <Text style={[s.cell, s.c1, s.headText]}>Verified</Text>
            <Text style={[s.cell, s.c1, s.headText]}>Stripe</Text>
            <Text style={[s.cell, s.c1, s.headText]}>Payout</Text>
            <Text style={[s.cell, s.c1, s.headText]}>Joined</Text>
          </View>
          {subs.map(sub => (
            <View key={sub.id} style={s.row}>
              <Text style={[s.cell, s.c1, s.name]} numberOfLines={1}>{sub.name}</Text>
              <Text style={[s.cell, s.c2, s.cellText]} numberOfLines={1}>
                {sub.skills?.join(', ') ?? '—'}
              </Text>
              <View style={[s.cell, s.c1]}>
                <RatingStars value={sub.rating} count={sub.rating_count} size="sm" />
              </View>
              <TouchableOpacity
                style={[s.cell, s.c1]}
                onPress={() => toggleVerified(sub.user_id, sub.verified)}
              >
                <View style={[s.pill, sub.verified ? s.pillGreen : s.pillGray]}>
                  <Text style={[s.pillText, sub.verified ? s.pillTextGreen : s.pillTextGray]}>
                    {sub.verified ? '✓ Verified' : 'Unverified'}
                  </Text>
                </View>
              </TouchableOpacity>
              <View style={[s.cell, s.c1]}>
                <View style={[s.pill, sub.stripe_account_id ? s.pillGreen : s.pillGray]}>
                  <Text style={[s.pillText, sub.stripe_account_id ? s.pillTextGreen : s.pillTextGray]}>
                    {sub.stripe_account_id ? 'Connected' : 'None'}
                  </Text>
                </View>
              </View>
              <Text style={[s.cell, s.c1, s.cellText]}>{sub.payout_type === 'instant' ? '⚡ Instant' : '🏦 Bank'}</Text>
              <Text style={[s.cell, s.c1, s.dateText]}>
                {new Date(sub.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 28, gap: 16 },
  pageTitle: { fontSize: 26, fontWeight: '800', color: '#1e293b' },
  tabRow: { flexDirection: 'row', gap: 8 },
  tab: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  tabActive: { backgroundColor: '#1a3c5e', borderColor: '#1a3c5e' },
  tabText: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  tabTextActive: { color: '#ffffff' },
  table: { backgroundColor: '#ffffff', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0' },
  head: { backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  headText: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' as any, letterSpacing: 0.5 },
  cell: { paddingHorizontal: 4 },
  c1: { flex: 1.5 }, c2: { flex: 2 },
  name: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  sub: { fontSize: 11, color: '#64748b' },
  cellText: { fontSize: 13, color: '#1e293b' },
  dateText: { fontSize: 12, color: '#64748b' },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' as any },
  pillGreen: { backgroundColor: '#dcfce7' },
  pillGray: { backgroundColor: '#f1f5f9' },
  pillText: { fontSize: 11, fontWeight: '600' },
  pillTextGreen: { color: '#15803d' },
  pillTextGray: { color: '#64748b' },
});
