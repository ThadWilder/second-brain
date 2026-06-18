// GestureNav — the two remaining blueprint nav gestures, built on RN's built-in
// PanResponder + Animated so they add NO native dependency (no
// react-native-gesture-handler / reanimated), matching SwipeableRow.
//
//   1. Edge-swipe nav drawer  — drag in from the left edge (or tap the grip) to
//      reveal the full navigation list. Swipe it left, tap the backdrop, or pick
//      an item to dismiss.
//   2. Swipe-between-subtabs  — a horizontal fling across screen content moves to
//      the adjacent PRIMARY tab (the four-item bottom bar order).
//
// Native-only: on web the sidebar already handles navigation, so when `enabled`
// is false this renders children straight through with zero overhead. Descendant
// gesture views (SwipeableRow tiles, horizontal ScrollViews) win the responder
// negotiation first, so neither gesture steals from them.

import { useRef, useState } from 'react';
import {
  Animated, PanResponder, View, Text, Pressable, StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

export type NavItem = { segment: string; icon: string; label: string };

const SWIPE_THRESHOLD = 70;   // horizontal travel that commits a tab switch
const EDGE_OPEN = 50;         // drag distance from the edge that opens the drawer
const CLOSE_DRAG = 50;        // leftward drag on the open drawer that closes it

export default function GestureNav({
  children,
  enabled,
  routePrefix,
  primary,
  full,
  current,
  accent,
  accentLight,
}: {
  children: React.ReactNode;
  enabled: boolean;
  routePrefix: string;            // '/(contractor)' | '/(sub)'
  primary: NavItem[];             // ordered tab list — drives swipe-between-tabs
  full: NavItem[];                // full nav list shown in the drawer
  current: string;                // current top-level path segment ('' = index)
  accent: string;
  accentLight: string;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const DRAWER_W = Math.min(320, Math.round(width * 0.82));

  const drawerX = useRef(new Animated.Value(-DRAWER_W)).current;
  const contentX = useRef(new Animated.Value(0)).current;
  const openRef = useRef(false);
  const [open, setOpen] = useState(false);

  const backdropOpacity = drawerX.interpolate({
    inputRange: [-DRAWER_W, 0],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const spring = (val: Animated.Value, toValue: number) =>
    Animated.spring(val, { toValue, useNativeDriver: true, bounciness: 0, speed: 18 });

  const openDrawer = () => { openRef.current = true; setOpen(true); spring(drawerX, 0).start(); };
  const closeDrawer = () => { openRef.current = false; setOpen(false); spring(drawerX, -DRAWER_W).start(); };

  const navigate = (segment: string) =>
    router.navigate((segment ? `${routePrefix}/${segment}` : `${routePrefix}/`) as any);

  // ── Edge-catch: drag in from the left to pull the drawer open ───────────────
  const edgePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => g.dx > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
      onPanResponderMove: (_e, g) => drawerX.setValue(Math.min(0, -DRAWER_W + Math.max(0, g.dx))),
      onPanResponderRelease: (_e, g) => (g.dx > EDGE_OPEN ? openDrawer() : closeDrawer()),
      onPanResponderTerminate: () => closeDrawer(),
    }),
  ).current;

  // ── Drawer panel: swipe it left to dismiss ──────────────────────────────────
  const drawerPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dx < -6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
      onPanResponderMove: (_e, g) => drawerX.setValue(Math.max(-DRAWER_W, Math.min(0, g.dx))),
      onPanResponderRelease: (_e, g) => (g.dx < -CLOSE_DRAG ? closeDrawer() : openDrawer()),
      onPanResponderTerminate: () => openDrawer(),
    }),
  ).current;

  // ── Content: horizontal fling → adjacent primary tab ────────────────────────
  const contentPan = useRef(
    PanResponder.create({
      // Only claim a deliberate, mostly-horizontal swipe, and never while the
      // drawer is open. Descendants (SwipeableRow, horizontal lists) are asked
      // first, so this only fires on otherwise non-horizontal content.
      onMoveShouldSetPanResponder: (_e, g) =>
        !openRef.current && Math.abs(g.dx) > 28 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderMove: (_e, g) => contentX.setValue(Math.max(-50, Math.min(50, g.dx * 0.3))),
      onPanResponderRelease: (_e, g) => {
        spring(contentX, 0).start();
        const idx = primary.findIndex(p => p.segment === current);
        if (idx === -1) return;                                  // not on a primary tab
        if (g.dx <= -SWIPE_THRESHOLD && idx < primary.length - 1) navigate(primary[idx + 1].segment);
        else if (g.dx >= SWIPE_THRESHOLD && idx > 0) navigate(primary[idx - 1].segment);
      },
      onPanResponderTerminate: () => spring(contentX, 0).start(),
    }),
  ).current;

  if (!enabled) return <>{children}</>;

  return (
    <View style={styles.root}>
      <Animated.View
        style={{ flex: 1, transform: [{ translateX: contentX }] }}
        {...contentPan.panHandlers}
      >
        {children}
      </Animated.View>

      {/* Left edge-catch + discoverable grip (hidden while the drawer is open). */}
      {!open && (
        <Pressable style={styles.edgeZone} onPress={openDrawer} {...edgePan.panHandlers}>
          <View style={[styles.grip, { backgroundColor: accent }]} />
        </Pressable>
      )}

      {/* Dimmed backdrop — tap to dismiss. */}
      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={[styles.backdrop, { opacity: backdropOpacity }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
      </Animated.View>

      {/* The drawer itself. */}
      <Animated.View
        style={[styles.drawer, { width: DRAWER_W, paddingTop: insets.top + spacing.lg, transform: [{ translateX: drawerX }] }]}
        {...drawerPan.panHandlers}
      >
        <Text style={styles.drawerTitle}>Menu</Text>
        {full.map(item => {
          const active = item.segment === current;
          return (
            <Pressable
              key={item.segment || 'index'}
              style={[styles.item, active && { backgroundColor: accentLight }]}
              onPress={() => { navigate(item.segment); closeDrawer(); }}
            >
              <Text style={styles.itemIcon}>{item.icon}</Text>
              <Text style={[styles.itemLabel, active && { color: accent, fontWeight: '700' }]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, position: 'relative', overflow: 'hidden' },
  edgeZone: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 24,
    justifyContent: 'center', alignItems: 'flex-start', zIndex: 20,
  },
  grip: { width: 4, height: 56, borderTopRightRadius: 4, borderBottomRightRadius: 4, opacity: 0.5 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 30 },
  drawer: {
    position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 40,
    backgroundColor: colors.background,
    borderRightWidth: 1, borderRightColor: colors.border,
    paddingHorizontal: spacing.sm, paddingBottom: spacing.lg,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 2, height: 0 }, elevation: 16,
  },
  drawerTitle: {
    fontSize: fontSize.sm, fontWeight: '700', color: colors.textMuted,
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 1,
  },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    borderRadius: radius.md, marginBottom: 2,
  },
  itemIcon: { fontSize: 24 },
  itemLabel: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500' },
});
