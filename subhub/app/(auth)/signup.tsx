import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { signUp } from '@/lib/auth';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import type { UserRole } from '@/lib/types';

export default function SignupScreen() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSignup() {
    if (!role) { setError('Select your account type.'); return; }
    if (!email || !password) { setError('Enter your email and password.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    setError('');
    const { error: err } = await signUp(email.trim().toLowerCase(), password, role);
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    router.replace(role === 'contractor' ? '/(auth)/onboard-contractor' : '/(auth)/onboard-sub');
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Join SubHub</Text>
        <Text style={styles.subtitle}>How will you use SubHub?</Text>
      </View>

      <View style={styles.form}>
        <View style={styles.roleRow}>
          <RoleTile
            label="I'm a Contractor"
            description="Post jobs, manage subs"
            selected={role === 'contractor'}
            onPress={() => setRole('contractor')}
          />
          <RoleTile
            label="I'm a Sub"
            description="Find jobs, get paid"
            selected={role === 'subcontractor'}
            onPress={() => setRole('subcontractor')}
          />
        </View>

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
          placeholder="Password (8+ characters)"
          placeholderTextColor={colors.textLight}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.button, !role && styles.buttonDisabled]}
          onPress={handleSignup}
          disabled={loading || !role}
        >
          {loading
            ? <ActivityIndicator color={colors.white} />
            : <Text style={styles.buttonText}>Continue</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backText}>Already have an account? Sign in</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function RoleTile({
  label, description, selected, onPress,
}: { label: string; description: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.roleTile, selected && styles.roleTileSelected]}
      onPress={onPress}
    >
      <Text style={[styles.roleLabel, selected && styles.roleLabelSelected]}>{label}</Text>
      <Text style={[styles.roleDesc, selected && styles.roleDescSelected]}>{description}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  header: {
    flex: 0.4,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  title: { fontSize: fontSize.xxxl, fontWeight: '800', color: colors.white },
  subtitle: { fontSize: fontSize.md, color: 'rgba(255,255,255,0.7)', marginTop: spacing.sm },
  form: {
    flex: 0.6,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg * 2,
    borderTopRightRadius: radius.lg * 2,
    padding: spacing.xl,
    gap: spacing.md,
  },
  roleRow: { flexDirection: 'row', gap: spacing.md },
  roleTile: {
    flex: 1,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  roleTileSelected: { borderColor: colors.primary, backgroundColor: '#eff6ff' },
  roleLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  roleLabelSelected: { color: colors.primary },
  roleDesc: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  roleDescSelected: { color: colors.primary },
  error: {
    color: colors.error, fontSize: fontSize.sm, textAlign: 'center',
    backgroundColor: '#fef2f2', padding: spacing.sm, borderRadius: radius.sm,
  },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, fontSize: fontSize.md, color: colors.text, backgroundColor: colors.surface,
  },
  button: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center',
  },
  buttonDisabled: { backgroundColor: colors.textLight },
  buttonText: { color: colors.white, fontSize: fontSize.md, fontWeight: '600' },
  backLink: { alignItems: 'center', padding: spacing.sm },
  backText: { color: colors.textMuted, fontSize: fontSize.sm },
});
