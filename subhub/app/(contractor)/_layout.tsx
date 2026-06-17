import { useState } from 'react';
import { Platform, View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, Image } from 'react-native';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

const SIDEBAR_W = 240;
const BREAKPOINT = 768;

const TABS = [
  { segment: '',         icon: '📋', label: 'My Jobs'   },
  { segment: 'post-job', icon: '➕', label: 'Post Job'  },
  { segment: 'messages', icon: '💬', label: 'Messages'  },
  { segment: 'subs',     icon: '🔍', label: 'Find Subs' },
  { segment: 'profile',  icon: '👤', label: 'Profile'   },
];

function ContractorSidebar({ onCollapse }: { onCollapse: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const current = pathname.split('/').filter(Boolean)[0] ?? '';

  return (
    <View style={s.sidebar}>
      <View style={s.logoRow}>
        <Image source={require('@/assets/logo.jpeg')} style={s.logoImage} resizeMode="contain" />
        <TouchableOpacity onPress={onCollapse} style={s.collapseBtn}>
          <Text style={s.collapseBtnText}>◀</Text>
        </TouchableOpacity>
      </View>
      {TABS.map(t => {
        const active = t.segment === current;
        return (
          <TouchableOpacity
            key={t.segment}
            style={[s.item, active && s.itemOn]}
            onPress={() => router.push((t.segment ? `/(contractor)/${t.segment}` : '/(contractor)/') as any)}
          >
            <Text style={s.icon}>{t.icon}</Text>
            <Text style={[s.label, active && s.labelOn]}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function ContractorLayout() {
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isWide = isWeb && width >= BREAKPOINT;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const showSidebar = isWide && sidebarOpen;

  return (
    <View style={{ flex: 1, flexDirection: isWide ? 'row' : 'column' }}>
      {showSidebar && <ContractorSidebar onCollapse={() => setSidebarOpen(false)} />}
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.textLight,
            tabBarLabelStyle: { fontSize: fontSize.xs, fontWeight: '600' },
            tabBarStyle: isWide ? { display: 'none' } : { borderTopColor: colors.border },
            headerStyle: { backgroundColor: colors.primary },
            headerTintColor: colors.white,
            headerTitleStyle: { fontWeight: '700', fontSize: 20 },
            headerLeft: (isWide && !sidebarOpen) ? () => (
              <TouchableOpacity onPress={() => setSidebarOpen(true)} style={{ paddingLeft: spacing.md }}>
                <Text style={{ fontSize: 22, color: colors.white }}>☰</Text>
              </TouchableOpacity>
            ) : undefined,
          }}
        >
          <Tabs.Screen name="index"    options={{ title: 'My Jobs',   tabBarIcon: ({ color }) => <Icon e="📋" c={color} /> }} />
          <Tabs.Screen name="post-job" options={{ title: 'Post Job',  tabBarIcon: ({ color }) => <Icon e="➕" c={color} /> }} />
          <Tabs.Screen name="messages" options={{ title: 'Messages',  tabBarIcon: ({ color }) => <Icon e="💬" c={color} /> }} />
          <Tabs.Screen name="subs"     options={{ title: 'Find Subs', tabBarIcon: ({ color }) => <Icon e="🔍" c={color} /> }} />
          <Tabs.Screen name="profile"  options={{ title: 'Profile',   tabBarIcon: ({ color }) => <Icon e="👤" c={color} /> }} />
          <Tabs.Screen name="jobs/[id]"    options={{ href: null }} />
          <Tabs.Screen name="chat/[jobId]" options={{ href: null, title: 'Chat' }} />
          <Tabs.Screen name="change-order" options={{ href: null, title: 'Change Order' }} />
          <Tabs.Screen name="add-payment"  options={{ href: null, title: 'Payment Method' }} />
        </Tabs>
      </View>
    </View>
  );
}

function Icon({ e, c }: { e: string; c: string }) {
  return <Text style={{ fontSize: 20, opacity: c === colors.primary ? 1 : 0.4 }}>{e}</Text>;
}

const s = StyleSheet.create({
  sidebar: {
    width: SIDEBAR_W,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    gap: 2,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0d1117',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  logoImage: { width: 160, height: 87 },
  collapseBtn: {
    padding: spacing.sm,
  },
  collapseBtnText: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.5)',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  itemOn: {
    backgroundColor: '#dbeafe',
  },
  icon: { fontSize: 26 },
  label: {
    fontSize: 20,
    color: colors.text,
    fontWeight: '500',
  },
  labelOn: {
    color: colors.primary,
    fontWeight: '700',
  },
});
