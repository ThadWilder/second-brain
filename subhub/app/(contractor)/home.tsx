import { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, StatusBar, ActivityIndicator } from 'react-native';
import { supabase } from '@/lib/supabase';
import { fontSize, spacing } from '@/lib/theme';

interface PlatformStats {
  jobs_completed: number;
  total_paid_out: number;
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

export default function ContractorHomeScreen() {
  const [stats, setStats] = useState<PlatformStats | null>(null);

  useEffect(() => {
    supabase.rpc('get_platform_stats').then(({ data }) => {
      if (data) setStats(data as PlatformStats);
    });
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Full-bleed background logo */}
      <Image
        source={require('@/assets/logo-hero.jpeg')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      />

      {/* Dark scrim behind stats */}
      <View style={styles.scrim} />

      {/* Platform stats pinned to the bottom */}
      <View style={styles.statsRow}>
        <View style={styles.statCell}>
          {stats == null
            ? <ActivityIndicator color="rgba(255,255,255,0.6)" />
            : <Text style={styles.statNumber}>{stats.jobs_completed.toLocaleString()}</Text>}
          <Text style={styles.statLabel}>Jobs Completed</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.statCell}>
          {stats == null
            ? <ActivityIndicator color="rgba(255,255,255,0.6)" />
            : <Text style={[styles.statNumber, styles.greenNumber]}>{formatMoney(Number(stats.total_paid_out))}</Text>}
          <Text style={styles.statLabel}>Paid to Crews</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 140,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  statsRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: 0,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  statNumber: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -1,
  },
  greenNumber: {
    color: '#22c55e',
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  divider: {
    width: 1,
    height: 56,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: spacing.lg,
  },
});
