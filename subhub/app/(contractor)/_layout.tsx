import { useState, useEffect } from 'react';
import { Platform, View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, Image } from 'react-native';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import { useUnreadMessages } from '@/lib/useUnreadMessages';
import NotificationBell from '@/components/NotificationBell';

const SIDEBAR_W = 240;
const COMPACT_W = 64;
const BREAKPOINT = 768;

// Blueprint nav: four primary destinations (Jobs · Crew · Pay+Market · Profile).
// These are the only items in the native tab bar and the compact mobile-web
// sidebar. Messages is NOT a tab — it lives inside each job card.
const PRIMARY = [
  { segment: '',         icon: '📋', label: 'Jobs'    },
  { segment: 'crew',     icon: '👷', label: 'Crew'    },
  { segment: 'payments', icon: '💳', label: 'Pay'     },
  { segment: 'profile',  icon: '👤', label: 'Profile' },
];

// The wide-screen (desktop web) sidebar shows the full set, grouped so every
// secondary screen (Post, Bulk, Projects, Market, Find Subs) stays one tap away.
const FULL = [
  { segment: 'home',      icon: '🏠', label: 'Home'      },
  { segment: '',          icon: '📋', label: 'My Jobs'   },
  { segment: 'post-job',  icon: '➕', label: 'Post Job'  },
  { segment: 'bulk-post', icon: '📦', label: 'Bulk Post' },
  { segment: 'projects',  icon: '🗂️', label: 'Projects'  },
  { segment: 'crew',      icon: '👷', label: 'Crew'      },
  { segment: 'subs',      icon: '🔍', label: 'Find Subs' },
  { segment: 'payments',  icon: '💳', label: 'Payments'  },
  { segment: 'market',    icon: '📊', label: 'Market'    },
  { segment: 'profile',   icon: '👤', label: 'Profile'   },
];

function ContractorSidebar({ unread, compact }: { unread: number; compact?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const current = pathname.split('/').filter(Boolean)[0] ?? '';

  if (compact) {
    return (
      <View style={s.sidebarCompact}>
        {PRIMARY.map(t => {
          const active = t.segment === current;
          return (
            <TouchableOpacity
              key={t.segment}
              style={[s.compactItem, active && s.compactItemOn]}
              onPress={() => router.push((t.segment ? `/(contractor)/${t.segment}` : '/(contractor)/') as any)}
            >
              <Text style={s.compactIcon}>{t.icon}</Text>
              {t.segment === 'messages' && unread > 0 && (
                <View style={s.compactBadge}>
                  <Text style={s.compactBadgeText}>{unread > 9 ? '9+' : unread}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  return (
    <View style={s.sidebar}>
      <View style={s.logoRow}>
        <Image source={require('@/assets/logo.jpeg')} style={s.logoImage} resizeMode="contain" />
      </View>
      {FULL.map(t => {
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
  const isCompact = isWeb && !isWide;   // mobile web: icon-only sidebar
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const pathname = usePathname();
  const isHome = pathname === '/home';
  const unread = useUnreadMessages();

  // On wide screens, auto-collapse sidebar on home splash for a clean full-bleed logo.
  // On compact (mobile web), sidebar is always visible so don't collapse it.
  useEffect(() => {
    if (isHome && isWide) setSidebarOpen(false);
  }, [isHome, isWide]);

  // Sidebar visibility: compact sidebar is always shown; wide sidebar respects toggle.
  const showSidebar = isCompact || (isWide && sidebarOpen);

  return (
    <View style={{ flex: 1, flexDirection: isWeb ? 'row' : 'column' }}>
      {showSidebar && <ContractorSidebar unread={unread} compact={isCompact} />}
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.textLight,
            tabBarLabelStyle: { fontSize: fontSize.xs, fontWeight: '600' },
            // Hide bottom tabs on all web — sidebar handles navigation.
            tabBarStyle: isWeb ? { display: 'none' } : { borderTopColor: colors.border },
            headerStyle: { backgroundColor: colors.primary },
            headerTintColor: colors.white,
            headerTitleStyle: { fontWeight: '700', fontSize: 20 },
            // Global notification bell in every screen header.
            headerRight: () => <NotificationBell tint={colors.white} />,
          }}
        >
          {/* Primary tabs (native bottom bar) */}
          <Tabs.Screen name="index"    options={{ title: 'My Jobs',  tabBarIcon: ({ color }) => <Icon e="📋" c={color} /> }} />
          <Tabs.Screen name="crew"     options={{ title: 'Crew',     tabBarIcon: ({ color }) => <Icon e="👷" c={color} /> }} />
          <Tabs.Screen name="payments" options={{ title: 'Pay',      tabBarIcon: ({ color }) => <Icon e="💳" c={color} /> }} />
          <Tabs.Screen name="profile"  options={{ title: 'Profile',  tabBarIcon: ({ color }) => <Icon e="👤" c={color} /> }} />
          {/* Secondary screens — reachable from the sidebar / in-screen links, not the bottom bar */}
          <Tabs.Screen name="home"      options={{ href: null, headerShown: false, title: 'Home' }} />
          <Tabs.Screen name="post-job"  options={{ href: null, title: 'Post Job' }} />
          <Tabs.Screen name="bulk-post" options={{ href: null, title: 'Bulk Post' }} />
          <Tabs.Screen name="projects"  options={{ href: null, title: 'Projects' }} />
          <Tabs.Screen name="projects/[id]" options={{ href: null, title: 'Project' }} />
          <Tabs.Screen name="subs"      options={{ href: null, title: 'Find Subs' }} />
          <Tabs.Screen name="market"    options={{ href: null, title: 'Market' }} />
          {/* Messaging lives inside the job card — not a standalone tab */}
          <Tabs.Screen name="messages"  options={{ href: null, title: 'Messages' }} />
          <Tabs.Screen name="jobs/[id]"    options={{ href: null }} />
          <Tabs.Screen name="chat/[jobId]" options={{ href: null, title: 'Chat' }} />
          <Tabs.Screen name="change-order" options={{ href: null, title: 'Change Order' }} />
          <Tabs.Screen name="add-payment"  options={{ href: null, title: 'Payment Method' }} />
        </Tabs>
      </View>

      {/* Collapse / expand handle — wide sidebar only */}
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
  sidebarCompact: {
    width: COMPACT_W,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    alignItems: 'center',
    gap: 0,
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
  compactItem: {
    width: 48,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    marginVertical: 2,
    position: 'relative',
  },
  compactItemOn: {
    backgroundColor: '#dbeafe',
  },
  compactIcon: { fontSize: 22 },
  compactBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  compactBadgeText: { color: colors.white, fontSize: 10, fontWeight: '700', lineHeight: 12 },
});
