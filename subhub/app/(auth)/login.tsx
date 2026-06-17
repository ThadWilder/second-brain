import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Image,
} from 'react-native';
import { Link } from 'expo-router';
import { signIn } from '@/lib/auth';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin() {
    if (!email || !password) { setError('Enter your email and password.'); return; }
    setLoading(true);
    setError('');
    const { error: err } = await signIn(email.trim().toLowerCase(), password);
    if (err) setError(err.message);
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.hero}>
        <Image source={require('@/assets/logo.jpeg')} style={styles.logoImage} resizeMode="contain" />
        <Text style={styles.tagline}>Contractors. Sub-Contractors. Connected</Text>
      </View>

      <View style={styles.form}>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.textLight}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.textLight}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          {loading
            ? <ActivityIndicator color={colors.white} />
            : <Text style={styles.buttonText}>Sign In</Text>}
        </TouchableOpacity>

        <Link href="/(auth)/signup" asChild>
          <TouchableOpacity style={styles.secondaryButton}>
            <Text style={styles.secondaryText}>New to SubHub? Create account</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  logoImage: { width: 220, height: 120 },
  tagline: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.75)', marginTop: spacing.sm, letterSpacing: 0.3, textAlign: 'center' },
  form: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg * 2,
    borderTopRightRadius: radius.lg * 2,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  error: {
    color: colors.error,
    fontSize: fontSize.sm,
    textAlign: 'center',
    backgroundColor: '#fef2f2',
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonText: { color: colors.white, fontSize: fontSize.md, fontWeight: '600' },
  secondaryButton: { alignItems: 'center', padding: spacing.sm },
  secondaryText: { color: colors.textMuted, fontSize: fontSize.sm },
});
