import { View, Text, TouchableOpacity, StyleSheet, Image, Platform, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { spacing, fontSize, radius } from '@/lib/theme';

export default function ContractorHomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.heroSection}>
        <Image
          source={require('@/assets/logo-hero.jpeg')}
          style={styles.heroLogo}
          resizeMode="contain"
        />
        <Text style={styles.tagline}>Scope it. Post it. Get it crewed.</Text>
      </View>

      <View style={styles.ctaSection}>
        <TouchableOpacity
          style={styles.primaryBtn}
          activeOpacity={0.85}
          onPress={() => router.push('/(contractor)/post-job' as any)}
        >
          <Text style={styles.primaryBtnIcon}>➕</Text>
          <View style={styles.btnTextWrap}>
            <Text style={styles.primaryBtnTitle}>Post a Job</Text>
            <Text style={styles.primaryBtnSub}>Scoped. Locked. Crewed.</Text>
          </View>
          <Text style={[styles.btnArrow, styles.primaryArrow]}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          activeOpacity={0.85}
          onPress={() => router.push('/(contractor)/' as any)}
        >
          <Text style={styles.secondaryBtnIcon}>📋</Text>
          <View style={styles.btnTextWrap}>
            <Text style={styles.secondaryBtnTitle}>My Jobs</Text>
            <Text style={styles.secondaryBtnSub}>Track posted, claimed &amp; active jobs</Text>
          </View>
          <Text style={styles.btnArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          activeOpacity={0.85}
          onPress={() => router.push('/(contractor)/subs' as any)}
        >
          <Text style={styles.secondaryBtnIcon}>🔍</Text>
          <View style={styles.btnTextWrap}>
            <Text style={styles.secondaryBtnTitle}>Find Subs</Text>
            <Text style={styles.secondaryBtnSub}>Browse &amp; invite crews</Text>
          </View>
          <Text style={styles.btnArrow}>→</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117', justifyContent: 'space-between' },
  heroSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: Platform.OS === 'web' ? spacing.xl * 2 : spacing.xl,
    gap: spacing.md,
  },
  heroLogo: { width: '100%', maxWidth: 520, aspectRatio: 1220 / 796 },
  tagline: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: '#60a5fa',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  ctaSection: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a3c5e',
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 4,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.25)',
  },
  primaryBtnIcon: { fontSize: 28 },
  primaryBtnTitle: { fontSize: fontSize.md, fontWeight: '700', color: '#fff', letterSpacing: -0.2 },
  primaryBtnSub: { fontSize: fontSize.xs, color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 4,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  secondaryBtnIcon: { fontSize: 28 },
  secondaryBtnTitle: { fontSize: fontSize.md, fontWeight: '700', color: '#fff', letterSpacing: -0.2 },
  secondaryBtnSub: { fontSize: fontSize.xs, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  btnTextWrap: { flex: 1 },
  btnArrow: { fontSize: 20, color: 'rgba(255,255,255,0.4)', fontWeight: '300' },
  primaryArrow: { color: 'rgba(96,165,250,0.6)' },
});
