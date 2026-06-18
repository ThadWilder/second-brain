import { useState, useEffect } from 'react';
import { Platform, View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, Image } from 'react-native';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import { useUnreadMessages } from '@/lib/useUnreadMessages';

const SIDEBAR_W = 240;
const BREAKPOINT = 768;

const TABS = [
  { segment: 'home',        icon: '🏠', label: 'Home'        },
  { segment: '',            icon: '🔍', label: 'Job Board'   },
  { segment: 'my-jobs',     icon: '🔨', label: 'My Jobs'     },
  { segment: 'earnings',    icon: '💰', label: 'Earnings'    },
  { segment: 'contractors', icon: '🏗️', label: 'Contractors' },
  { segment: 'messages',    icon: '💬', label: 'Messages'    },
  { segment: 'profile',     icon: '👤', label: 'Profile'     },
];

function SubSidebar({ unread }: { unread: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const current = pathname.split('/').filter(Boolean)[0] ?? '';

  return (
    <View style={s.sidebar}>
      <View style={s.logoRow}>
        <Image source={require('@/assets/logo.jpeg')} style={s.logoImage} resizeMode="contain" />
      </View>
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
            {t.segment === 'messages' && unread > 0 && (
              <View style={s.sidebarBadge}><Text style={s.sidebarBadgeText}>{unread}</Text></View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function SubLayout() {
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isWide = isWeb && width >= BREAKPOINT;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const pathname = usePathname();
  const isHome = pathname === '/home';
  const showSidebar = isWide && sidebarOpen;
  const unread = useUnreadMessages();

  // Land on the home splash with the sidebar collapsed for a clean full-bleed
  // logo; the divider handle stays available to open navigation.
  useEffect(() => {
    if (isHome) setSidebarOpen(false);
  }, [isHome]);

  return (
    <View style={{ flex: 1, flexDirection: isWide ? 'row' : 'column' }}>
      {showSidebar && <SubSidebar unread={unread} />}
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            tabBarActiveTintColor: colors.accent,
            tabBarInactiveTintColor: colors.textLight,
            tabBarLabelStyle: { fontSize: fontSize.xs, fontWeight: '600' },
            tabBarStyle: isWide ? { display: 'none' } : { borderTopColor: colors.border },
            headerStyle: { backgroundColor: colors.primary },
            headerTintColor: colors.white,
            headerTitleStyle: { fontWeight: '700', fontSize: 20 },
          }}
        >
          <Tabs.Screen name="home"         options={{ headerShown: false, title: 'Home', tabBarIcon: ({ color }) => <Icon e="🏠" c={color} /> }} />
          <Tabs.Screen name="index"        options={{ title: 'Job Board',   tabBarIcon: ({ color }) => <Icon e="🔍" c={color} /> }} />
          <Tabs.Screen name="my-jobs"      options={{ title: 'My Jobs',     tabBarIcon: ({ color }) => <Icon e="🔨" c={color} /> }} />
          <Tabs.Screen name="earnings"     options={{ title: 'Earnings',    tabBarIcon: ({ color }) => <Icon e="💰" c={color} /> }} />
          <Tabs.Screen name="contractors"  options={{ title: 'Contractors', tabBarIcon: ({ color }) => <Icon e="🏗️" c={color} /> }} />
          <Tabs.Screen name="messages"     options={{ title: 'Messages',    tabBarBadge: unread > 0 ? unread : undefined, tabBarIcon: ({ color }) => <Icon e="💬" c={color} /> }} />
          <Tabs.Screen name="profile"      options={{ title: 'Profile',     tabBarIcon: ({ color }) => <Icon e="👤" c={color} /> }} />
          <Tabs.Screen name="saved-searches" options={{ href: null, title: 'Job Alerts' }} />
          <Tabs.Screen name="jobs/[id]"      options={{ href: null }} />
          <Tabs.Screen name="chat/[jobId]"   options={{ href: null, title: 'Chat' }} />
          <Tabs.Screen name="rate/[jobId]"   options={{ href: null, title: 'Leave a Review' }} />
          <Tabs.Screen name="change-order"   options={{ href: null, title: 'Change Order' }} />
          <Tabs.Screen name="connect-stripe" options={{ href: null, title: 'Payout Account' }} />
        </Tabs>
      </View>

      {/* Collapse / expand handle — sits on the divider line between sidebar and content */}
      {isWide && (
        <TouchableOpacity
          onPress={() => setSidebarOpen(o => !o)}
          style={[s.collapseHandle, { left: sidebarOpen ? SIDEBAR_W - 13 : -1 }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={s.collapseHandleText}>{sidebarOpen ? '‹' : '›'}</Text>
        </TouchableOpacity>
      )}
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
  collapseHandle: {
    position: 'absolute',
    top: '50%',
    marginTop: -54,
    width: 60,
    height: 108,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  collapseHandleText: {
    color: colors.primary,
    fontSize: 54,
    fontWeight: '800',
    lineHeight: 56,
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
    fontSize: 20,
    color: colors.text,
    fontWeight: '500',
  },
  labelOn: {
    color: colors.accent,
    fontWeight: '700',
  },
  sidebarBadge: {
    minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  sidebarBadgeText: { color: colors.white, fontSize: fontSize.xs, fontWeight: '700' },
});
