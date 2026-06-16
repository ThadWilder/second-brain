import { Platform, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

const SIDEBAR_W = 240;

const TABS = [
  { segment: '',         icon: '🔍', label: 'Job Board' },
  { segment: 'my-jobs',  icon: '🔨', label: 'My Jobs'   },
  { segment: 'messages', icon: '💬', label: 'Messages'  },
  { segment: 'profile',  icon: '👤', label: 'Profile'   },
];

function SubSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const current = pathname.split('/').filter(Boolean)[0] ?? '';

  return (
    <View style={s.sidebar}>
      <Text style={s.logo}>SubHub</Text>
      {TABS.map(t => {
        const active = t.segment === current;
        return (
          <TouchableOpacity
            key={t.segment}
            style={[s.item, active && s.itemOn]}
            onPress={() => router.push((t.segment ? `/(sub)/${t.segment}` : '/(sub)/') as any)}
          >
            <Text style={s.icon}>{t.icon}</Text>
            <Text style={[s.label, active && s.labelOn]}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function SubLayout() {
  const web = Platform.OS === 'web';
  return (
    <View style={{ flex: 1, flexDirection: web ? 'row' : 'column' }}>
      {web && <SubSidebar />}
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            tabBarActiveTintColor: colors.accent,
            tabBarInactiveTintColor: colors.textLight,
            tabBarLabelStyle: { fontSize: fontSize.xs, fontWeight: '600' },
            tabBarStyle: web ? { display: 'none' } : { borderTopColor: colors.border },
            headerStyle: { backgroundColor: colors.primary },
            headerTintColor: colors.white,
            headerTitleStyle: { fontWeight: '700' },
          }}
        >
          <Tabs.Screen name="index"      options={{ title: 'Job Board', tabBarIcon: ({ color }) => <Icon e="🔍" c={color} /> }} />
          <Tabs.Screen name="my-jobs"    options={{ title: 'My Jobs',   tabBarIcon: ({ color }) => <Icon e="🔨" c={color} /> }} />
          <Tabs.Screen name="messages"   options={{ title: 'Messages',  tabBarIcon: ({ color }) => <Icon e="💬" c={color} /> }} />
          <Tabs.Screen name="profile"    options={{ title: 'Profile',   tabBarIcon: ({ color }) => <Icon e="👤" c={color} /> }} />
          <Tabs.Screen name="jobs/[id]"      options={{ href: null }} />
          <Tabs.Screen name="chat/[jobId]"   options={{ href: null, title: 'Chat' }} />
          <Tabs.Screen name="rate/[jobId]"   options={{ href: null, title: 'Leave a Review' }} />
          <Tabs.Screen name="change-order"   options={{ href: null, title: 'Change Order' }} />
          <Tabs.Screen name="connect-stripe" options={{ href: null, title: 'Payout Account' }} />
        </Tabs>
      </View>
    </View>
  );
}

function Icon({ e, c }: { e: string; c: string }) {
  return <Text style={{ fontSize: 20, opacity: c === colors.accent ? 1 : 0.4 }}>{e}</Text>;
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
  logo: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.md,
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
    backgroundColor: colors.accentLight,
  },
  icon: { fontSize: 26 },
  label: {
    fontSize: 33,
    color: colors.text,
    fontWeight: '500',
  },
  labelOn: {
    color: colors.accent,
    fontWeight: '700',
  },
});
