import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize } from '@/lib/theme';

export default function ContractorMessages() {
  const router = useRouter();
  const [threads, setThreads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: jobs } = await supabase
      .from('jobs')
      .select('id, title, status, messages(id, body, sender_role, sender_id, read_at, created_at)')
      .eq('contractor_id', session.user.id);

    const withMessages = (jobs ?? [])
      .filter(j => (j.messages as any[]).length > 0)
      .map(j => {
        const msgs = j.messages as any[];
        const sorted = [...msgs].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        const unread = msgs.filter(m => m.sender_id !== session.user.id && !m.read_at).length;
        return { ...j, lastMsg: sorted[0], unread };
      })
      .sort((a, b) => new Date(b.lastMsg.created_at).getTime() - new Date(a.lastMsg.created_at).getTime());

    setThreads(withMessages);
    setLoading(false);
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />;

  if (threads.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No messages yet</Text>
        <Text style={styles.emptySub}>
          Conversations appear here once a sub claims one of your jobs.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={threads}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.row}
          onPress={() => router.push(`/(contractor)/chat/${item.id}`)}
        >
          <View style={styles.info}>
            <Text style={[styles.title, item.unread > 0 && styles.titleUnread]} numberOfLines={1}>{item.title}</Text>
            <Text style={[styles.preview, item.unread > 0 && styles.previewUnread]} numberOfLines={1}>
              {item.lastMsg.sender_role === 'contractor' ? 'You: ' : 'Sub: '}
              {item.lastMsg.body}
            </Text>
          </View>
          <View style={styles.meta}>
            <Text style={styles.time}>{formatTime(item.lastMsg.created_at)}</Text>
            {item.unread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.unread}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      )}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
    />
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const diffHrs = (Date.now() - d.getTime()) / 3600000;
  if (diffHrs < 24) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffHrs < 168) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  emptySub: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.lg, gap: spacing.md, backgroundColor: colors.background,
  },
  info: { flex: 1, gap: 4 },
  title: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  titleUnread: { fontWeight: '800' },
  preview: { fontSize: fontSize.sm, color: colors.textMuted },
  previewUnread: { color: colors.text, fontWeight: '600' },
  meta: { alignItems: 'flex-end', gap: 6 },
  time: { fontSize: fontSize.xs, color: colors.textLight },
  badge: {
    minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: colors.white, fontSize: fontSize.xs, fontWeight: '700' },
  sep: { height: 1, backgroundColor: colors.border, marginLeft: spacing.lg },
});
