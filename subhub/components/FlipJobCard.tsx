import { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, PanResponder, StyleSheet } from 'react-native';
import { colors, spacing, radius, fontSize } from '@/lib/theme';
import RatingStars from '@/components/RatingStars';
import type { Job } from '@/lib/types';

const CARD_H = 300;
const SWIPE_T = 90;

interface Props {
  job: Job;
  onViewDetail: () => void;
  onSave: (id: string) => void;
  onPass: (id: string) => void;
  onToggleSave?: (id: string, next: boolean) => void;
  saved?: boolean;
}

export default function FlipJobCard({ job, onViewDetail, onSave, onPass, onToggleSave, saved }: Props) {
  const [flipped, setFlipped] = useState(false);
  const flipVal  = useRef(new Animated.Value(0)).current;
  const swipeVal = useRef(new Animated.Value(0)).current;
  const heartVal = useRef(new Animated.Value(0)).current;
  const lastTap  = useRef(0);
  const flipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Single tap flips; double-tap saves (the familiar "like" gesture). We delay
  // the flip briefly so a second tap can cancel it and trigger a save instead.
  function handleTap() {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      if (flipTimer.current) { clearTimeout(flipTimer.current); flipTimer.current = null; }
      lastTap.current = 0;
      onToggleSave?.(job.id, !saved);
      if (!saved) {
        heartVal.setValue(0);
        Animated.sequence([
          Animated.spring(heartVal, { toValue: 1, friction: 4, useNativeDriver: false }),
          Animated.timing(heartVal, { toValue: 0, delay: 400, duration: 250, useNativeDriver: false }),
        ]).start();
      }
      return;
    }
    lastTap.current = now;
    flipTimer.current = setTimeout(() => { toggleFlip(); flipTimer.current = null; }, 280);
  }

  // Flip: instant opacity swap at the 90° midpoint (no ghosting)
  const frontRY  = flipVal.interpolate({ inputRange: [0, 1], outputRange: ['0deg',   '180deg'] });
  const backRY   = flipVal.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  const frontOp  = flipVal.interpolate({ inputRange: [0, 0.49, 0.5, 1], outputRange: [1, 1, 0, 0] });
  const backOp   = flipVal.interpolate({ inputRange: [0, 0.49, 0.5, 1], outputRange: [0, 0, 1, 1] });

  function toggleFlip() {
    Animated.spring(flipVal, {
      toValue: flipped ? 0 : 1,
      friction: 8,
      tension: 40,
      useNativeDriver: false,
    }).start();
    setFlipped(f => !f);
  }

  // Swipe: overlays + card tilt
  const saveOp = swipeVal.interpolate({ inputRange: [0, SWIPE_T],  outputRange: [0, 1], extrapolate: 'clamp' });
  const passOp = swipeVal.interpolate({ inputRange: [-SWIPE_T, 0], outputRange: [1, 0], extrapolate: 'clamp' });
  const tilt   = swipeVal.interpolate({ inputRange: [-200, 0, 200], outputRange: ['-5deg', '0deg', '5deg'], extrapolate: 'clamp' });

  const pan = useRef(PanResponder.create({
    // Only capture horizontal drags on the front face
    onMoveShouldSetPanResponder: (_, g) =>
      !flipped && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove:  (_, g) => swipeVal.setValue(g.dx),
    onPanResponderRelease: (_, g) => {
      if (g.dx > SWIPE_T) {
        Animated.timing(swipeVal, { toValue: 600, duration: 240, useNativeDriver: false })
          .start(() => onSave(job.id));
      } else if (g.dx < -SWIPE_T) {
        Animated.timing(swipeVal, { toValue: -600, duration: 240, useNativeDriver: false })
          .start(() => onPass(job.id));
      } else {
        Animated.spring(swipeVal, { toValue: 0, friction: 6, useNativeDriver: false }).start();
      }
    },
  })).current;

  const payout = job.sub_payout.toLocaleString('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  });

  return (
    <Animated.View
      {...pan.panHandlers}
      style={[s.outer, { transform: [{ translateX: swipeVal }, { rotate: tilt }] }]}
    >
      {/* ── Swipe overlays ── */}
      <Animated.View style={[s.swipeTag, s.tagSave, { opacity: saveOp }]}>
        <Text style={s.tagText}>SAVE 💰</Text>
      </Animated.View>
      <Animated.View style={[s.swipeTag, s.tagPass, { opacity: passOp }]}>
        <Text style={s.tagText}>PASS ✕</Text>
      </Animated.View>

      {/* ── FRONT FACE ── */}
      <Animated.View style={[
        s.face,
        job.boosted && s.boostedBorder,
        { opacity: frontOp, transform: [{ perspective: 1200 }, { rotateY: frontRY }] },
      ]}>
        <Animated.View pointerEvents="none" style={[s.heartBurst, {
          opacity: heartVal,
          transform: [{ scale: heartVal.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.4] }) }],
        }]}>
          <Text style={s.heartGlyph}>💚</Text>
        </Animated.View>
        <TouchableOpacity activeOpacity={0.9} onPress={handleTap} style={s.inner}>

          {/* Badges */}
          {(job.boosted || saved
            || (job.crew_priority_until && new Date(job.crew_priority_until) > new Date())
            || (job.overflow_until && new Date(job.overflow_until) > new Date())) && (
            <View style={s.badgeRow}>
              {job.boosted && <View style={s.boostBadge}><Text style={s.boostText}>⚡ Boosted</Text></View>}
              {saved       && <View style={s.savedBadge}><Text style={s.savedText}>💚 Saved</Text></View>}
              {job.crew_priority_until && new Date(job.crew_priority_until) > new Date() && (
                <View style={s.crewBadge}><Text style={s.crewText}>👷 Crew Priority</Text></View>
              )}
              {(!job.crew_priority_until || new Date(job.crew_priority_until) <= new Date())
                && job.overflow_until && new Date(job.overflow_until) > new Date() && (
                <View style={s.overflowBadge}><Text style={s.overflowText}>🌐 Crew Overflow</Text></View>
              )}
            </View>
          )}

          {/* Title + payout */}
          <View style={s.titleRow}>
            <View style={s.titleCol}>
              <Text style={s.title} numberOfLines={2}>{job.title}</Text>
              <Text style={s.loc}>📍 {job.city}, {job.state}</Text>
            </View>
            <View style={s.payCol}>
              <Text style={s.pay}>{payout}</Text>
              <Text style={s.payLabel}>payout</Text>
            </View>
          </View>

          {/* Chips */}
          <View style={s.chipRow}>
            <Chip>{`📅 ${job.estimated_days}d`}</Chip>
            <Chip>{`🏗️ ${job.industry}`}</Chip>
            <Chip>{matLabel(job.material_status)}</Chip>
          </View>

          {/* Scope preview */}
          <Text style={s.scope} numberOfLines={3}>{job.scope_of_work}</Text>

          {/* Footer */}
          <View style={s.frontFooter}>
            {job.contractor
              ? <Text style={s.biz} numberOfLines={1}>{(job.contractor as any).business_name}</Text>
              : <View />}
            <Text style={s.hint}>Tap to flip · double-tap to save · swipe ←/→</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* ── BACK FACE ── */}
      <Animated.View style={[
        s.face,
        job.boosted && s.boostedBorder,
        { opacity: backOp, transform: [{ perspective: 1200 }, { rotateY: backRY }] },
      ]}>
        <TouchableOpacity activeOpacity={0.9} onPress={toggleFlip} style={s.inner}>

          {/* Title + payout (same header) */}
          <View style={s.titleRow}>
            <View style={s.titleCol}>
              <Text style={s.title} numberOfLines={2}>{job.title}</Text>
              <Text style={s.loc}>📍 {job.city}, {job.state}</Text>
            </View>
            <View style={s.payCol}>
              <Text style={s.pay}>{payout}</Text>
              <Text style={s.payLabel}>payout</Text>
            </View>
          </View>

          {/* Full scope */}
          <Text style={s.scope} numberOfLines={4}>{job.scope_of_work}</Text>

          {/* Detail chips */}
          <View style={s.chipRow}>
            <Chip>{`📅 ${job.estimated_days} day${job.estimated_days !== 1 ? 's' : ''}`}</Chip>
            <Chip>{matLabel(job.material_status)}</Chip>
          </View>

          {/* Contractor */}
          {job.contractor && (
            <View style={s.contractorRow}>
              <Text style={[s.biz, { flex: 1 }]} numberOfLines={1}>
                Posted by {(job.contractor as any).business_name}
              </Text>
              <RatingStars
                value={(job.contractor as any).rating ?? 0}
                count={(job.contractor as any).rating_count ?? 0}
                size="sm"
              />
            </View>
          )}

          {/* Actions */}
          <View style={s.backFooter}>
            <Text style={s.hint}>← tap to flip back</Text>
            <TouchableOpacity
              style={s.viewBtn}
              onPress={e => { e.stopPropagation?.(); onViewDetail(); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={s.viewBtnText}>View Full Job →</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

function Chip({ children }: { children: string }) {
  return <View style={s.chip}><Text style={s.chipText}>{children}</Text></View>;
}

function matLabel(status: Job['material_status']) {
  if (status === 'on_site') return '📦 On-site';
  if (status === 'local')   return '📦 Local pickup';
  return '📦 Distant';
}

const s = StyleSheet.create({
  outer: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    height: CARD_H,
  },
  swipeTag: {
    position: 'absolute',
    zIndex: 20,
    top: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 2,
  },
  tagSave: { left: 14, borderColor: colors.accent, backgroundColor: colors.accentLight },
  tagPass: { right: 14, borderColor: colors.error,  backgroundColor: '#fef2f2' },
  tagText: { fontSize: fontSize.xs, fontWeight: '800', color: colors.text },
  face: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 12,
    elevation: 3,
  },
  boostedBorder: {
    borderWidth: 1.5,
    borderColor: colors.warning,
    backgroundColor: '#fffdf7',
  },
  heartBurst: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', zIndex: 30,
  },
  heartGlyph: { fontSize: 88 },
  inner: {
    flex: 1,
    padding: spacing.md,
    gap: 8,
  },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  boostBadge: { backgroundColor: '#fef3c7', borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  boostText:  { fontSize: 11, fontWeight: '800', color: '#92400e' },
  savedBadge: { backgroundColor: colors.accentLight, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  savedText:  { fontSize: 11, fontWeight: '800', color: colors.accent },
  crewBadge:  { backgroundColor: '#dbeafe', borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  crewText:   { fontSize: 11, fontWeight: '800', color: colors.primary },
  overflowBadge: { backgroundColor: '#e0e7ff', borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  overflowText:  { fontSize: 11, fontWeight: '800', color: '#4338ca' },
  titleRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  titleCol: { flex: 1, gap: 3 },
  title:    { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  loc:      { fontSize: 13, color: colors.textMuted },
  payCol:   { alignItems: 'flex-end' },
  pay:      { fontSize: 24, fontWeight: '800', color: colors.accent },
  payLabel: { fontSize: 11, color: colors.textMuted },
  chipRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  chip:     { backgroundColor: colors.surfaceAlt, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 11, color: colors.textMuted, fontWeight: '500' },
  scope:    { fontSize: 13, color: colors.textMuted, lineHeight: 18, flex: 1 },
  frontFooter:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  biz:      { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  hint:     { fontSize: 11, color: colors.textLight, fontStyle: 'italic' },
  contractorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  backFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  viewBtn:  { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 8 },
  viewBtnText: { color: colors.white, fontSize: 13, fontWeight: '700' },
});
