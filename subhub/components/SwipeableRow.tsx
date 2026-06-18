// SwipeableRow — swipe a tile left to reveal quick actions (blueprint §2.1).
// Built on React Native's built-in PanResponder + Animated so it works on
// native AND web with no extra native dependencies (no gesture-handler /
// reanimated). Used by the contractor My Jobs list for Invite a Sub / Archive.

import { useRef } from 'react';
import {
  Animated, PanResponder, View, Text, TouchableOpacity, StyleSheet,
} from 'react-native';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

export type SwipeAction = {
  label: string;
  icon?: string;
  color?: string;       // background color of the action button
  textColor?: string;
  onPress: () => void;
};

const ACTION_W = 92;          // width of each revealed action button
const OPEN_THRESHOLD = 40;    // drag distance past which we snap open

export default function SwipeableRow({
  actions,
  children,
}: {
  actions: SwipeAction[];
  children: React.ReactNode;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const openX = -ACTION_W * actions.length;
  // Track the resting offset so a drag continues from the current position.
  const offset = useRef(0);

  const snap = (to: number) => {
    offset.current = to;
    Animated.spring(translateX, {
      toValue: to,
      useNativeDriver: true,
      bounciness: 0,
      speed: 18,
    }).start();
  };

  const pan = useRef(
    PanResponder.create({
      // Only take over for deliberate horizontal drags (let vertical scroll pass).
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_e, g) => {
        const next = Math.min(0, Math.max(openX, offset.current + g.dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_e, g) => {
        const next = offset.current + g.dx;
        // Snap open if dragged left past the threshold, else closed.
        if (next < -OPEN_THRESHOLD) snap(openX);
        else snap(0);
      },
      onPanResponderTerminate: () => snap(offset.current < openX / 2 ? openX : 0),
    }),
  ).current;

  return (
    <View style={styles.wrap}>
      {/* Action buttons sit behind the row, revealed as it slides left. */}
      <View style={styles.actions} pointerEvents="box-none">
        {actions.map((a, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.action, { width: ACTION_W, backgroundColor: a.color ?? colors.primary }]}
            onPress={() => { snap(0); a.onPress(); }}
          >
            {a.icon ? <Text style={styles.actionIcon}>{a.icon}</Text> : null}
            <Text style={[styles.actionLabel, { color: a.textColor ?? colors.white }]} numberOfLines={1}>
              {a.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Animated.View style={{ transform: [{ translateX }] }} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', overflow: 'hidden' },
  actions: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'stretch',
  },
  action: {
    alignItems: 'center', justifyContent: 'center', gap: 2,
    marginVertical: spacing.sm, borderRadius: radius.md, marginLeft: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  actionIcon: { fontSize: 20 },
  actionLabel: { fontSize: fontSize.xs, fontWeight: '700', textAlign: 'center' },
});
