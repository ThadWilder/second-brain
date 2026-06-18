import { useState, useEffect } from 'react';
import { Platform, View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, Image } from 'react-native';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import { useUnreadMessages } from '@/lib/useUnreadMessages';

const SIDEBAR_W = 240;
const BREAKPOINT = 768;

const TABS = [
  { segment: 'home',     icon: '🏠', label: 'Home'      },
  { segment: '',         icon: '📋', label: 'My Jobs'   },
  { segment: 'post-job', icon: '➕', label: 'Post Job'  },
  { segment: 'projects', icon: '🗂️', label: 'Projects'  },
  { segment: 'crew',     icon: '👷', label: 'Crew'      },
  { segment: 'payments', icon: '💳', label: 'Payments'  },
  { segment: 'messages', icon: '💬', label: 'Messages'  },
  { segment: 'subs',     icon: '🔍', label: 'Find Subs' },
  { segment: 'profile',  icon: '👤', label: 'Profile'   },
];

function ContractorSidebar({ unread }: { unread: number }) {
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
            onPress={() => router.push((t.segment ? `/(contractor)/${t.segment}` : '/(contractor)/') as any)}
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

export default function ContractorLayout() {
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
      {showSidebar && <ContractorSidebar unread={unread} />}
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
          }}
        >
          <Tabs.Screen name="home"     options={{ headerShown: false, title: 'Home', tabBarIcon: ({ color }) => <Icon e="🏠" c={color} /> }} />
          <Tabs.Screen name="index"    options={{ title: 'My Jobs',   tabBarIcon: ({ color }) => <Icon e="📋" c={color} /> }} />
          <Tabs.Screen name="post-job" options={{ title: 'Post Job',  tabBarIcon: ({ color }) => <Icon e="➕" c={color} /> }} />
          <Tabs.Screen name="projects" options={{ title: 'Projects',  tabBarIcon: ({ color }) => <Icon e="🗂️" c={color} /> }} />
          <Tabs.Screen name="projects/[id]" options={{ href: null, title: 'Project' }} />
          <Tabs.Screen name="crew"     options={{ title: 'Crew',      tabBarIcon: ({ color }) => <Icon e="👷" c={color} /> }} />
          <Tabs.Screen name="payments" options={{ title: 'Payments',  tabBarIcon: ({ color }) => <Icon e="💳" c={color} /> }} />
          <Tabs.Screen name="messages" options={{ title: 'Messages',  tabBarBadge: unread > 0 ? unread : undefined, tabBarIcon: ({ color }) => <Icon e="💬" c={color} /> }} />
          <Tabs.Screen name="subs"     options={{ title: 'Find Subs', tabBarIcon: ({ color }) => <Icon e="🔍" c={color} /> }} />
          <Tabs.Screen name="profile"  options={{ title: 'Profile',   tabBarIcon: ({ color }) => <Icon e="👤" c={color} /> }} />
          <Tabs.Screen name="jobs/[id]"    options={{ href: null }} />
          <Tabs.Screen name="chat/[jobId]" options={{ href: null, title: 'Chat' }} />
          <Tabs.Screen name="change-order" options={{ href: null, title: 'Change Order' }} />
          <Tabs.Screen name="add-payment"  options={{ href: null, title: 'Payment Method' }} />
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
  sidebarBadge: {
    minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  sidebarBadgeText: { color: colors.white, fontSize: fontSize.xs, fontWeight: '700' },
});
