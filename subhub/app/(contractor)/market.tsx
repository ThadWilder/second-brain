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

export default function MarketScreen() {
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

  const maxPosted = Math.max(...byState.map(r => r.posted), 1);

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <Text style={s.heading}>Market Pulse</Text>
      <Text style={s.sub}>Platform-wide demand and fill-rate data</Text>

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

      {/* Summary cards */}
      {summary ? (
        <View style={s.cardGrid}>
          <StatCard label="Jobs Posted" value={summary.jobs_posted.toLocaleString()} />
          <StatCard label="Currently Open" value={summary.jobs_open.toLocaleString()} />
          <StatCard
            label="Fill Rate"
            value={summary.fill_rate != null ? `${summary.fill_rate}%` : '—'}
            accent={summary.fill_rate >= 70}
          />
          <StatCard
            label="Avg Payout"
            value={summary.avg_payout != null ? `$${summary.avg_payout.toLocaleString()}` : '—'}
          />
          <StatCard label="Active States" value={summary.active_states.toString()} />
          <StatCard label="Active Trades" value={summary.active_trades.toString()} />
        </View>
      ) : (
        <EmptyState message="No job data for this period yet." />
      )}

      {/* By state */}
      <Text style={s.sectionTitle}>Demand by State</Text>
      {byState.length === 0 ? (
        <EmptyState message="No state data yet." />
      ) : (
        <View style={s.table}>
          <View style={[s.tableRow, s.tableHeader]}>
            <Text style={[s.cell, s.cellState, s.headerText]}>State</Text>
            <Text style={[s.cell, s.cellNum, s.headerText]}>Jobs</Text>
            <Text style={[s.cell, s.cellNum, s.headerText]}>Fill%</Text>
            <Text style={[s.cell, s.cellNum, s.headerText]}>Avg $</Text>
            <Text style={[s.cell, s.cellNum, s.headerText]}>Hrs</Text>
          </View>
          {byState.map(row => (
            <View key={row.state} style={s.tableRow}>
              <View style={[s.cell, s.cellState]}>
                <Text style={s.stateLabel}>{row.state}</Text>
                <View style={s.barTrack}>
                  <View style={[s.barFill, { width: `${(row.posted / maxPosted) * 100}%` as any }]} />
                </View>
              </View>
              <Text style={[s.cell, s.cellNum, s.cellText]}>{row.posted}</Text>
              <Text style={[s.cell, s.cellNum, s.cellText,
                row.fill_rate >= 80 ? s.good : row.fill_rate <= 40 ? s.warn : null]}>
                {row.fill_rate != null ? `${row.fill_rate}%` : '—'}
              </Text>
              <Text style={[s.cell, s.cellNum, s.cellText]}>
                {row.avg_payout != null ? `$${Math.round(row.avg_payout / 1000)}k` : '—'}
              </Text>
              <Text style={[s.cell, s.cellNum, s.cellText]}>
                {row.avg_hours_to_claim != null ? row.avg_hours_to_claim : '—'}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* By industry */}
      <Text style={s.sectionTitle}>Demand by Trade</Text>
      {byIndustry.length === 0 ? (
        <EmptyState message="No trade data yet." />
      ) : (
        <View style={s.table}>
          <View style={[s.tableRow, s.tableHeader]}>
            <Text style={[s.cell, s.cellTrade, s.headerText]}>Trade</Text>
            <Text style={[s.cell, s.cellNum, s.headerText]}>Jobs</Text>
            <Text style={[s.cell, s.cellNum, s.headerText]}>Fill%</Text>
            <Text style={[s.cell, s.cellNum, s.headerText]}>Avg $</Text>
            <Text style={[s.cell, s.cellNum, s.headerText]}>Days</Text>
          </View>
          {byIndustry.map(row => (
            <View key={row.industry} style={s.tableRow}>
              <Text style={[s.cell, s.cellTrade, s.cellText]}>{row.industry}</Text>
              <Text style={[s.cell, s.cellNum, s.cellText]}>{row.posted}</Text>
              <Text style={[s.cell, s.cellNum, s.cellText,
                row.fill_rate >= 80 ? s.good : row.fill_rate <= 40 ? s.warn : null]}>
                {row.fill_rate != null ? `${row.fill_rate}%` : '—'}
              </Text>
              <Text style={[s.cell, s.cellNum, s.cellText]}>
                {row.avg_payout != null ? `$${Math.round(row.avg_payout / 1000)}k` : '—'}
              </Text>
              <Text style={[s.cell, s.cellNum, s.cellText]}>
                {row.avg_days != null ? row.avg_days : '—'}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Text style={s.footer}>
        Data covers the last {period} days. Excludes drafts and cancelled jobs.
      </Text>
    </ScrollView>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={s.statCard}>
      <Text style={[s.statValue, accent && s.statValueAccent]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
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
  periodBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  periodBtnText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '600' },
  periodBtnTextOn: { color: colors.white },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  statCard: {
    flex: 1, minWidth: 100,
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center',
  },
  statValue: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text },
  statValueAccent: { color: colors.accent },
  statLabel: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  sectionTitle: {
    fontSize: fontSize.md, fontWeight: '700', color: colors.text,
    marginTop: spacing.lg, marginBottom: spacing.sm,
    borderBottomWidth: 2, borderBottomColor: colors.primary, paddingBottom: 4,
  },
  table: {
    borderRadius: radius.md, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  tableHeader: { backgroundColor: colors.surface },
  headerText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted },
  cell: { padding: spacing.sm },
  cellState: { flex: 2 },
  cellTrade: { flex: 2.5 },
  cellNum: { flex: 1, alignItems: 'flex-end' as any, textAlign: 'right' as any },
  cellText: { fontSize: fontSize.xs, color: colors.text },
  stateLabel: { fontSize: fontSize.xs, color: colors.text, fontWeight: '600' },
  barTrack: {
    height: 4, backgroundColor: colors.border,
    borderRadius: radius.full, marginTop: 3, width: '90%',
  },
  barFill: { height: 4, backgroundColor: colors.primary, borderRadius: radius.full },
  good: { color: colors.accent },
  warn: { color: colors.warning },
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
