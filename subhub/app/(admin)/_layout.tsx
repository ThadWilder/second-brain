import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput } from 'react-native';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { signOut } from '@/lib/auth';
import { spacing, radius } from '@/lib/theme';

const NAV = [
  { segment: '',         icon: '📊', label: 'Dashboard'  },
  { segment: 'jobs',     icon: '🔨', label: 'Jobs'       },
  { segment: 'users',    icon: '👥', label: 'Users'      },
  { segment: 'disputes', icon: '⚠️',  label: 'Disputes'  },
  { segment: 'payments', icon: '💰', label: 'Payments'   },
];

function AdminSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);
  const current = segments[segments.length - 1] === 'admin' ? '' : segments[segments.length - 1] ?? '';

  return (
    <View style={s.sidebar}>
      <View style={s.logoWrap}>
        <Text style={s.logo}>SubHub</Text>
        <Text style={s.logoSub}>Admin Portal</Text>
      </View>
      <View style={s.nav}>
        {NAV.map(item => {
          const active = item.segment === current;
          return (
            <TouchableOpacity
              key={item.segment}
              style={[s.navItem, active && s.navItemActive]}
              onPress={() => router.push(item.segment ? `/(admin)/${item.segment}` : '/(admin)/' as any)}
            >
              <Text style={s.navIcon}>{item.icon}</Text>
              <Text style={[s.navLabel, active && s.navLabelActive]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity style={s.signOutBtn} onPress={signOut}>
        <Text style={s.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function AdminLayout() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [pinVerified, setPinVerified] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.user_metadata?.role !== 'admin') {
        router.replace('/(auth)/');
      }
      setChecking(false);
    });
  }, []);

  async function submitPin() {
    if (!pin.trim()) return;
    setVerifying(true);
    setPinError('');
    const { data, error } = await supabase.functions.invoke('admin-action', {
      body: { action: 'verify_pin', pin: pin.trim() },
    });
    setVerifying(false);
    if (error || !data?.valid) {
      setPinError('Incorrect PIN. Try again.');
      setPin('');
      return;
    }
    setPinVerified(true);
  }

  if (checking) return <ActivityIndicator style={{ flex: 1 }} color="#1a3c5e" />;

  if (!pinVerified) {
    return (
      <View style={s.pinScreen}>
        <View style={s.pinCard}>
          <Text style={s.pinLogo}>SubHub</Text>
          <Text style={s.pinTitle}>Admin Access</Text>
          <Text style={s.pinSubtitle}>Enter your admin PIN to continue.</Text>
          <TextInput
            style={[s.pinInput, pinError ? s.pinInputError : null]}
            value={pin}
            onChangeText={v => { setPin(v); setPinError(''); }}
            placeholder="PIN"
            placeholderTextColor="#94a3b8"
            secureTextEntry
            keyboardType="default"
            onSubmitEditing={submitPin}
            autoFocus
          />
          {pinError ? <Text style={s.pinError}>{pinError}</Text> : null}
          <TouchableOpacity
            style={[s.pinButton, (!pin.trim() || verifying) && s.pinButtonDisabled]}
            onPress={submitPin}
            disabled={!pin.trim() || verifying}
          >
            {verifying
              ? <ActivityIndicator color="#ffffff" />
              : <Text style={s.pinButtonText}>Enter</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={signOut} style={s.pinSignOut}>
            <Text style={s.pinSignOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <AdminSidebar />
      <View style={s.content}>
        <Tabs screenOptions={{ tabBarStyle: { display: 'none' }, headerShown: false }}>
          <Tabs.Screen name="index"    />
          <Tabs.Screen name="jobs"     />
          <Tabs.Screen name="users"    />
          <Tabs.Screen name="disputes" />
          <Tabs.Screen name="payments" />
        </Tabs>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  pinScreen: { flex: 1, backgroundColor: '#1a3c5e', alignItems: 'center', justifyContent: 'center' },
  pinCard: {
    backgroundColor: '#ffffff', borderRadius: 16, padding: 36,
    width: 340, alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOpacity: 0.2, shadowOffset: { width: 0, height: 8 }, shadowRadius: 24, elevation: 10,
  },
  pinLogo: { fontSize: 28, fontWeight: '800', color: '#1a3c5e' },
  pinTitle: { fontSize: 20, fontWeight: '700', color: '#1e293b', marginTop: 4 },
  pinSubtitle: { fontSize: 13, color: '#64748b', textAlign: 'center' as any, marginBottom: 4 },
  pinInput: {
    width: '100%' as any, borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10,
    padding: 14, fontSize: 18, color: '#1e293b', textAlign: 'center' as any,
    letterSpacing: 4, backgroundColor: '#f8fafc',
  },
  pinInputError: { borderColor: '#ef4444', backgroundColor: '#fff1f2' },
  pinError: { fontSize: 13, color: '#ef4444', fontWeight: '500' },
  pinButton: {
    width: '100%' as any, backgroundColor: '#1a3c5e', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center' as any, marginTop: 4,
  },
  pinButtonDisabled: { opacity: 0.4 },
  pinButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
  pinSignOut: { marginTop: 4 },
  pinSignOutText: { fontSize: 13, color: '#94a3b8' },
  root: { flex: 1, flexDirection: 'row', backgroundColor: '#f1f5f9' },
  sidebar: {
    width: 220,
    backgroundColor: '#1a3c5e',
    paddingVertical: spacing.xl,
    gap: spacing.xs,
  },
  logoWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.12)',
    marginBottom: spacing.md,
  },
  logo: { fontSize: 28, fontWeight: '800', color: '#ffffff' },
  logoSub: { fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 },
  nav: { flex: 1, gap: 2, paddingHorizontal: spacing.sm },
  navItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 10, paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  navItemActive: { backgroundColor: 'rgba(255,255,255,0.15)' },
  navIcon: { fontSize: 18 },
  navLabel: { fontSize: 15, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  navLabelActive: { color: '#ffffff', fontWeight: '700' },
  signOutBtn: {
    marginHorizontal: spacing.sm,
    paddingVertical: 10, paddingHorizontal: spacing.md,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)',
    marginTop: spacing.md,
  },
  signOutText: { fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: '500' },
  content: { flex: 1 },
});
