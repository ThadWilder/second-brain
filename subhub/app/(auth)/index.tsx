import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Image, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { spacing, fontSize, radius } from '@/lib/theme';

export default function LandingScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Hero logo */}
      <View style={styles.heroSection}>
        <Image
          source={require('@/assets/logo-hero.jpeg')}
          style={styles.heroLogo}
          resizeMode="contain"
        />
      </View>

      {/* Pitch copy */}
      <View style={styles.pitchSection}>
        <Text style={styles.pitchHeadline}>The job board for fencing crews.</Text>
        <Text style={styles.pitchSub}>Post a scoped job. Claim one. Get paid — all in the app.</Text>
      </View>

      {/* CTA section */}
      <View style={styles.ctaSection}>
        <TouchableOpacity
          style={styles.contractorBtn}
          activeOpacity={0.85}
          onPress={() => router.push({ pathname: '/(auth)/signup', params: { role: 'contractor' } })}
        >
          <Text style={styles.contractorBtnIcon}>📋</Text>
          <View style={styles.btnTextWrap}>
            <Text style={styles.contractorBtnTitle}>Post a Job</Text>
            <Text style={styles.contractorBtnSub}>Scoped. Locked. Crewed.</Text>
          </View>
          <Text style={styles.btnArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.subBtn}
          activeOpacity={0.85}
          onPress={() => router.push({ pathname: '/(auth)/signup', params: { role: 'subcontractor' } })}
        >
          <Text style={styles.subBtnIcon}>💰</Text>
          <View style={styles.btnTextWrap}>
            <Text style={styles.subBtnTitle}>Find Work</Text>
            <Text style={styles.subBtnSub}>Browse. Claim. Get Paid.</Text>
          </View>
          <Text style={[styles.btnArrow, styles.subBtnArrow]}>→</Text>
        </TouchableOpacity>
      </View>

      {/* Sign in */}
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
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
    justifyContent: 'space-between',
  },

  heroSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: Platform.OS === 'web' ? spacing.xl * 2 : spacing.xl,
  },
  heroLogo: {
    width: '100%',
    maxWidth: 520,
    aspectRatio: 1220 / 796,
  },

  pitchSection: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
    alignItems: 'center',
  },
  pitchHeadline: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  pitchSub: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    lineHeight: 20,
    letterSpacing: 0.1,
  },

  ctaSection: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },

  contractorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a3c5e',
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 4,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  contractorBtnIcon: { fontSize: 28 },
  contractorBtnTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.2,
  },
  contractorBtnSub: {
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 1,
  },

  subBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#14532d',
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 4,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
  },
  subBtnIcon: { fontSize: 28 },
  subBtnTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: '#22c55e',
    letterSpacing: -0.2,
  },
  subBtnSub: {
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 1,
  },

  btnTextWrap: { flex: 1 },
  btnArrow: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '300',
  },
  subBtnArrow: { color: 'rgba(34,197,94,0.5)' },

  signInRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xl,
  },
  signInText: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.35)' },
  signInLink: { fontSize: fontSize.sm, fontWeight: '700', color: '#22c55e' },
});
