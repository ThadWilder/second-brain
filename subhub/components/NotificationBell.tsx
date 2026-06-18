import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import { getUserRole } from '@/lib/auth';
import { useNotifications, type NotificationItem } from '@/lib/useNotifications';

const SCREEN = Dimensions.get('window');
const BADGE_COLOR = colors.error;

export default function NotificationBell({ tint }: { tint?: string }) {
  const { items, unreadCount, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const bellColor = tint ?? colors.text;

  const handleRowPress = async (item: NotificationItem) => {
    setOpen(false);
    if (item.job_id) {
      const role = await getUserRole();
      if (role === 'contractor') {
        router.push(`/(contractor)/jobs/${item.job_id}` as any);
      } else if (role === 'subcontractor') {
        router.push(`/(sub)/jobs/${item.job_id}` as any);
      }
    }
    markAllRead();
  };

  return (
    <View>
      <TouchableOpacity
        onPress={() => setOpen((v) => !v)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Notifications"
      >
        <Text style={[styles.bell, { color: bellColor }]}>🔔</Text>
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.tray} onPress={(e) => e.stopPropagation?.()}>
            <View style={styles.trayHeader}>
              <Text style={styles.trayTitle}>Notifications</Text>
              {unreadCount > 0 && (
                <TouchableOpacity onPress={() => markAllRead()} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Text style={styles.markAll}>Mark all read</Text>
                </TouchableOpacity>
              )}
            </View>

            {items.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>✅</Text>
                <Text style={styles.emptyText}>You're all caught up</Text>
              </View>
            ) : (
              <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
                {items.map((item) => {
                  const unread = !item.read_at;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.rowItem, unread && styles.rowUnread]}
                      onPress={() => handleRowPress(item)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.rowBody} numberOfLines={2}>{item.body}</Text>
                      <Text style={styles.rowTime}>{timeAgo(item.created_at)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'just now';
}

const styles = StyleSheet.create({
  bell: { fontSize: fontSize.md },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: radius.full,
    backgroundColor: BADGE_COLOR,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.15)' },
  tray: {
    position: 'absolute',
    top: 56,
    right: spacing.md,
    width: 340,
    maxWidth: SCREEN.width - spacing.md * 2,
    maxHeight: SCREEN.height * 0.7,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 16,
    elevation: 8,
    overflow: 'hidden',
  },
  trayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  trayTitle: { fontSize: fontSize.sm, fontWeight: '800', color: colors.text },
  markAll: { fontSize: fontSize.xs, fontWeight: '700', color: colors.primary },
  list: { maxHeight: SCREEN.height * 0.7 - 50 },
  rowItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceAlt,
    gap: 2,
  },
  rowUnread: {
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  rowTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  rowBody: { fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 18 },
  rowTime: { fontSize: fontSize.xs, color: colors.textLight },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  emptyIcon: { fontSize: fontSize.lg },
  emptyText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '600' },
});
