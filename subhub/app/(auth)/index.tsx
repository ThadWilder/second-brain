import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

export default function LandingScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Contractor tile — top half */}
      <TouchableOpacity
        style={styles.contractorTile}
        activeOpacity={0.88}
        onPress={() => router.push({ pathname: '/(auth)/signup', params: { role: 'contractor' } })}
      >
        <View style={styles.tileInner}>
          <Text style={styles.tileIcon}>📋</Text>
          <Text style={styles.tileTitle}>Post a Job</Text>
          <Text style={styles.tileSubtitle}>
            You sold it. Now build your crew.{'\n'}
            Post a scoped job and get bids{'\n'}
            from verified field subs.
          </Text>
          <View style={styles.tileCta}>
            <Text style={styles.tileCtaText}>Post a job  →</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Center divider */}
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <View style={styles.logoChip}>
          <Text style={styles.logoText}>SubHub</Text>
        </View>
        <View style={styles.dividerLine} />
      </View>

      {/* Sub tile — bottom half */}
      <TouchableOpacity
        style={styles.subTile}
        activeOpacity={0.88}
        onPress={() => router.push({ pathname: '/(auth)/signup', params: { role: 'subcontractor' } })}
      >
        <View style={styles.tileInner}>
          <Text style={styles.tileIcon}>💰</Text>
          <Text style={[styles.tileTitle, styles.subTileTitle]}>Find Work</Text>
          <Text style={[styles.tileSubtitle, styles.subTileSubtitle]}>
            Browse fully scoped jobs near you.{'\n'}
            Claim, complete, and get paid{'\n'}
            — all inside the app.
          </Text>
          <View style={[styles.tileCta, styles.subTileCta]}>
            <Text style={[styles.tileCtaText, styles.subTileCtaText]}>Find work  →</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Sign in link */}
      <TouchableOpacity
        style={styles.signInRow}
        onPress={() => router.push('/(auth)/login')}
      >
        <Text style={styles.signInText}>Already have an account?  </Text>
        <Text style={styles.signInLink}>Sign in</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  contractorTile: {
    flex: 1,
    backgroundColor: colors.primary,
    justifyContent: 'center',
  },
  subTile: {
    flex: 1,
    backgroundColor: colors.accent,
    justifyContent: 'center',
  },

  tileInner: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  tileIcon: {
    fontSize: 48,
    marginBottom: spacing.xs,
  },
  tileTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.5,
  },
  subTileTitle: {
    color: '#0f2a0a',
  },
  tileSubtitle: {
    fontSize: fontSize.md,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 22,
  },
  subTileSubtitle: {
    color: 'rgba(0,0,0,0.55)',
  },
  tileCta: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  subTileCta: {
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderColor: 'rgba(0,0,0,0.2)',
  },
  tileCtaText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: fontSize.sm,
    letterSpacing: 0.2,
  },
  subTileCtaText: {
    color: '#0f2a0a',
  },

  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.xl,
    height: 36,
    zIndex: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  logoChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: spacing.sm,
  },
  logoText: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  signInRow: {
    position: 'absolute',
    bottom: spacing.xl,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signInText: { fontSize: fontSize.sm, color: 'rgba(0,0,0,0.45)' },
  signInLink: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },
});
