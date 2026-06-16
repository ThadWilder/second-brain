import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import RatingStars from '@/components/RatingStars';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import type { ContractorProfile } from '@/lib/types';

export default function ContractorSearchScreen() {
  const [contractors, setContractors] = useState<ContractorProfile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchContractors(); }, []);

  async function fetchContractors() {
    const { data } = await supabase
      .from('contractor_profiles')
      .select('id, business_name, contact_name, scope_of_work, service_area_zip, service_area_miles, rating, rating_count, payment_terms_days, delay_pay_rate_per_hour, addon_pay_rate_per_lf, return_trip_fee')
      .order('rating', { ascending: false });
    setContractors((data ?? []) as ContractorProfile[]);
    setLoading(false);
  }

  const filtered = contractors.filter(c =>
    !search ||
    c.business_name.toLowerCase().includes(search.toLowerCase()) ||
    c.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.scope_of_work?.some(s => s.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          placeholder="Search by name or trade..."
          placeholderTextColor={colors.textLight}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <Text style={styles.count}>{filtered.length} contractor{filtered.length !== 1 ? 's' : ''}</Text>
          {filtered.map(c => (
            <ContractorCard key={c.id} contractor={c} />
          ))}
          {filtered.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No contractors match your search.</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function ContractorCard({ contractor: c }: { contractor: ContractorProfile }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.flex}>
          <Text style={styles.name}>{c.business_name}</Text>
          <Text style={styles.contact}>{c.contact_name}</Text>
        </View>
        <RatingStars value={c.rating} count={c.rating_count} size="sm" />
      </View>

      {c.scope_of_work?.length > 0 && (
        <View style={styles.trades}>
          {c.scope_of_work.map(s => (
            <View key={s} style={styles.tradePill}>
              <Text style={styles.tradeText}>{s}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.metaRow}>
        <MetaItem label="Service area" value={`${c.service_area_miles} mi from ${c.service_area_zip}`} />
        <MetaItem label="Payment terms" value={`${c.payment_terms_days} days`} />
        <MetaItem label="Delay pay" value={`$${c.delay_pay_rate_per_hour}/hr`} />
        <MetaItem label="Add-on pay" value={`$${c.addon_pay_rate_per_lf}/LF`} />
      </View>
    </View>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  searchBar: {
    backgroundColor: colors.background, padding: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.sm, fontSize: fontSize.md, color: colors.text, backgroundColor: colors.surface,
  },
  loader: { marginTop: spacing.xxl },
  list: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  count: { fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.background, borderRadius: radius.md,
    padding: spacing.md, gap: spacing.sm,
    shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex: { flex: 1 },
  name: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  contact: { fontSize: fontSize.sm, color: colors.textMuted },
  trades: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tradePill: {
    backgroundColor: colors.accentLight, borderRadius: 999,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
  },
  tradeText: { fontSize: fontSize.xs, color: colors.accent, fontWeight: '600' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  metaItem: { minWidth: '45%' as any },
  metaLabel: { fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  metaValue: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600' },
  empty: { alignItems: 'center', padding: spacing.xxl },
  emptyText: { fontSize: fontSize.md, color: colors.textMuted, textAlign: 'center' },
});
