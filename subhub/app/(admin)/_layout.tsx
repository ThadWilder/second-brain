import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
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

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.user_metadata?.role !== 'admin') {
        router.replace('/(auth)/');
      }
      setChecking(false);
    });
  }, []);

  if (checking) return <ActivityIndicator style={{ flex: 1 }} color="#1a3c5e" />;

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
