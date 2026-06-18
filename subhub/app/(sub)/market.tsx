import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

type Period = 7 | 30 | 90;

interface Summary {
  period_days: number;
  jobs_posted: number;
  jobs_open: number;
  jobs_claimed: number;
  fill_rate: number;
  avg_payout: number;
  active_states: number;
  active_trades: number;
}

interface StatByState {
  state: string;
  posted: number;
  claimed: number;
  fill_rate: number;
  avg_payout: number;
  avg_hours_to_claim: number;
}

interface StatByIndustry {
  industry: string;
  posted: number;
  claimed: number;
  fill_rate: number;
  avg_payout: number;
  avg_days: number;
}

export default function SubMarketScreen() {
  const [period, setPeriod] = useState<Period>(30);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [byState, setByState] = useState<StatByState[]>([]);
  const [byIndustry, setByIndustry] = useState<StatByIndustry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [sumRes, stateRes, industryRes] = await Promise.all([
      supabase.rpc('market_summary', { p_days: period }),
      supabase.rpc('market_stats_by_state', { p_days: period }),
      supabase.rpc('market_stats_by_industry', { p_days: period }),
    ]);
    if (sumRes.data) setSummary(sumRes.data as Summary);
    if (stateRes.data) setByState(stateRes.data as StatByState[]);
    if (industryRes.data) setByIndustry(industryRes.data as StatByIndustry[]);
    setLoading(false);
    setRefreshing(false);
  }, [period]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  // Show highest-payout states first for subs
  const sortedByPayout = [...byState].sort((a, b) => (b.avg_payout ?? 0) - (a.avg_payout ?? 0));
  const sortedIndustryByPayout = [...byIndustry].sort((a, b) => (b.avg_payout ?? 0) - (a.avg_payout ?? 0));

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      <Text style={s.heading}>Where's the Work</Text>
      <Text style={s.sub}>Live demand across the SubHub platform</Text>

      {/* Period selector */}
      <View style={s.periodRow}>
        {([7, 30, 90] as Period[]).map(p => (
          <TouchableOpacity
            key={p}
            style={[s.periodBtn, period === p && s.periodBtnOn]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[s.periodBtnText, period === p && s.periodBtnTextOn]}>
              {p}d
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Summary banner */}
      {summary ? (
        <View style={s.banner}>
          <View style={s.bannerItem}>
            <Text style={s.bannerValue}>{summary.jobs_open.toLocaleString()}</Text>
            <Text style={s.bannerLabel}>Open Jobs</Text>
          </View>
          <View style={s.bannerDivider} />
          <View style={s.bannerItem}>
            <Text style={s.bannerValue}>
              {summary.avg_payout != null ? `$${summary.avg_payout.toLocaleString()}` : '—'}
            </Text>
            <Text style={s.bannerLabel}>Avg Payout</Text>
          </View>
          <View style={s.bannerDivider} />
          <View style={s.bannerItem}>
            <Text style={s.bannerValue}>{summary.active_states}</Text>
            <Text style={s.bannerLabel}>States</Text>
          </View>
          <View style={s.bannerDivider} />
          <View style={s.bannerItem}>
            <Text style={s.bannerValue}>
              {summary.fill_rate != null ? `${summary.fill_rate}%` : '—'}
            </Text>
            <Text style={s.bannerLabel}>Fill Rate</Text>
          </View>
        </View>
      ) : (
        <EmptyState message="No platform data for this period yet." />
      )}

      {/* Top-paying trades */}
      <Text style={s.sectionTitle}>Highest-Paying Trades</Text>
      {sortedIndustryByPayout.length === 0 ? (
        <EmptyState message="No trade data yet." />
      ) : (
        <View style={s.cards}>
          {sortedIndustryByPayout.map((row, i) => (
            <View key={row.industry} style={s.tradeCard}>
              <View style={s.tradeRank}>
                <Text style={s.tradeRankText}>#{i + 1}</Text>
              </View>
              <View style={s.tradeInfo}>
                <Text style={s.tradeName}>{row.industry}</Text>
                <Text style={s.tradeMeta}>
                  {row.posted} jobs · {row.avg_days != null ? `${row.avg_days}d avg` : '—'}
                </Text>
              </View>
              <View style={s.tradePayout}>
                <Text style={s.tradePayoutValue}>
                  {row.avg_payout != null ? `$${Math.round(row.avg_payout).toLocaleString()}` : '—'}
                </Text>
                <Text style={s.tradePayoutLabel}>avg</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Top-paying states */}
      <Text style={s.sectionTitle}>Active Markets by State</Text>
      {sortedByPayout.length === 0 ? (
        <EmptyState message="No state data yet." />
      ) : (
        <View style={s.table}>
          <View style={[s.tableRow, s.tableHeader]}>
            <Text style={[s.cell, s.cellState, s.headerText]}>State</Text>
            <Text style={[s.cell, s.cellNum, s.headerText]}>Open</Text>
            <Text style={[s.cell, s.cellNum, s.headerText]}>Avg $</Text>
            <Text style={[s.cell, s.cellNum, s.headerText]}>Fill%</Text>
            <Text style={[s.cell, s.cellNum, s.headerText]}>Hrs</Text>
          </View>
          {sortedByPayout.map(row => {
            const open = row.posted - row.claimed;
            return (
              <View key={row.state} style={s.tableRow}>
                <Text style={[s.cell, s.cellState, s.cellText, s.stateBold]}>{row.state}</Text>
                <Text style={[s.cell, s.cellNum, s.cellText, open > 0 ? s.open : null]}>
                  {open > 0 ? open : '0'}
                </Text>
                <Text style={[s.cell, s.cellNum, s.cellText, s.payoutText]}>
                  {row.avg_payout != null ? `$${Math.round(row.avg_payout / 1000)}k` : '—'}
                </Text>
                <Text style={[s.cell, s.cellNum, s.cellText]}>
                  {row.fill_rate != null ? `${row.fill_rate}%` : '—'}
                </Text>
                <Text style={[s.cell, s.cellNum, s.cellText]}>
                  {row.avg_hours_to_claim != null ? row.avg_hours_to_claim : '—'}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      <Text style={s.footer}>
        {period}-day window. &quot;Hrs&quot; = average hours from posted to claimed.
      </Text>
    </ScrollView>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <View style={s.empty}>
      <Text style={s.emptyText}>{message}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.md, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  sub: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2, marginBottom: spacing.md },
  periodRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  periodBtn: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  periodBtnOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  periodBtnText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '600' },
  periodBtnTextOn: { color: colors.white },
  banner: {
    flexDirection: 'row', backgroundColor: colors.primary,
    borderRadius: radius.md, padding: spacing.md,
    marginBottom: spacing.lg, alignItems: 'center',
  },
  bannerItem: { flex: 1, alignItems: 'center' },
  bannerValue: { fontSize: fontSize.md, fontWeight: '800', color: colors.white },
  bannerLabel: { fontSize: fontSize.xs, color: 'rgba(255,255,255,0.65)', marginTop: 2, textAlign: 'center' },
  bannerDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.2)' },
  sectionTitle: {
    fontSize: fontSize.md, fontWeight: '700', color: colors.text,
    marginTop: spacing.lg, marginBottom: spacing.sm,
    borderBottomWidth: 2, borderBottomColor: colors.accent, paddingBottom: 4,
  },
  cards: { gap: spacing.sm, marginBottom: spacing.sm },
  tradeCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, gap: spacing.md,
  },
  tradeRank: {
    width: 32, height: 32, borderRadius: radius.full,
    backgroundColor: colors.accentLight, alignItems: 'center', justifyContent: 'center',
  },
  tradeRankText: { fontSize: fontSize.xs, fontWeight: '800', color: colors.accent },
  tradeInfo: { flex: 1 },
  tradeName: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  tradeMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  tradePayout: { alignItems: 'flex-end' },
  tradePayoutValue: { fontSize: fontSize.md, fontWeight: '800', color: colors.accent },
  tradePayoutLabel: { fontSize: fontSize.xs, color: colors.textMuted },
  table: {
    borderRadius: radius.md, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm,
  },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  tableHeader: { backgroundColor: colors.surface },
  headerText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted },
  cell: { padding: spacing.sm },
  cellState: { flex: 1.5 },
  cellNum: { flex: 1, alignItems: 'flex-end' as any, textAlign: 'right' as any },
  cellText: { fontSize: fontSize.xs, color: colors.text },
  stateBold: { fontWeight: '700' },
  open: { color: colors.accent, fontWeight: '700' },
  payoutText: { color: colors.primary, fontWeight: '700' },
  empty: {
    padding: spacing.lg, backgroundColor: colors.surface,
    borderRadius: radius.md, alignItems: 'center', marginBottom: spacing.md,
  },
  emptyText: { fontSize: fontSize.sm, color: colors.textMuted },
  footer: {
    fontSize: fontSize.xs, color: colors.textLight,
    textAlign: 'center', marginTop: spacing.lg,
  },
});
