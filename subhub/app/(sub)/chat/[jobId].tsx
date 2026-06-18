import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { isDemoId, getDemoJob, getDemoMessages } from '@/lib/demo';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

export default function SubChat() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const navigation = useNavigation();
  const demo = isDemoId(jobId);
  const [messages, setMessages] = useState<any[]>([]);
  const [myId, setMyId] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [theyreTyping, setTheyreTyping] = useState(false);
  const listRef = useRef<FlatList>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);

  // Stamp read_at on inbound messages I haven't read yet.
  async function markRead(uid: string) {
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('job_id', jobId)
      .neq('sender_id', uid)
      .is('read_at', null);
  }

  useEffect(() => {
    // Demo conversation — render the canned thread, skip auth/realtime/DB.
    if (demo) {
      const dj = getDemoJob(jobId);
      if (dj) navigation.setOptions({ title: dj.title });
      setMessages(getDemoMessages(jobId));
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50);
      return;
    }
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const uid = session.user.id;
      setMyId(uid);

      const [{ data: msgs }, { data: job }] = await Promise.all([
        supabase.from('messages').select('*').eq('job_id', jobId).order('created_at'),
        supabase.from('jobs').select('title, contractor_id').eq('id', jobId).single(),
      ]);

      setMessages(msgs ?? []);
      if (job) navigation.setOptions({
        title: job.title,
        headerRight: () => (
          <TouchableOpacity onPress={handleCall} style={{ paddingHorizontal: 12 }}>
            <Text style={{ fontSize: 22 }}>📞</Text>
          </TouchableOpacity>
        ),
      });
      setLoading(false);
      markRead(uid);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50);

      const channel = supabase
        .channel(`sub-chat-${jobId}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'messages',
          filter: `job_id=eq.${jobId}`,
        }, payload => {
          setMessages(prev => [...prev, payload.new]);
          if (payload.new.sender_id !== uid) markRead(uid);
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
        })
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'messages',
          filter: `job_id=eq.${jobId}`,
        }, payload => {
          setMessages(prev => prev.map(m => (m.id === payload.new.id ? payload.new : m)));
        })
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          if (payload?.userId && payload.userId !== uid) {
            setTheyreTyping(true);
            if (typingTimeout.current) clearTimeout(typingTimeout.current);
            typingTimeout.current = setTimeout(() => setTheyreTyping(false), 3000);
          }
        })
        .subscribe();
      channelRef.current = channel;
    });

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
    };
  }, [jobId]);

  function onChangeText(v: string) {
    setText(v);
    // Throttle typing broadcasts to ~1/sec
    const now = Date.now();
    if (channelRef.current && myId && now - lastTypingSent.current > 1000) {
      lastTypingSent.current = now;
      channelRef.current.send({ type: 'broadcast', event: 'typing', payload: { userId: myId } });
    }
  }

  async function handleCall() {
    Alert.alert(
      'Call via SubHub',
      'SubHub will call your phone and connect you to the contractor. Neither party will see the other\'s real number.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Call Now',
          onPress: async () => {
            const { error } = await supabase.functions.invoke('call-connect', {
              body: { jobId },
            });
            if (error) Alert.alert('Error', 'Could not connect the call. Make sure your phone number is set in your profile.');
          },
        },
      ]
    );
  }

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setText('');
    // In demo mode just append locally so the thread feels live.
    if (demo) {
      setMessages(prev => [...prev, {
        id: `demo-msg-local-${Date.now()}`,
        job_id: jobId,
        sender_id: 'demo-sub',
        sender_role: 'subcontractor',
        body,
        created_at: new Date().toISOString(),
        read_at: new Date().toISOString(),
      }]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
      return;
    }
    setSending(true);
    // Push is fired server-side by the on_message_insert trigger.
    await supabase.from('messages').insert({
      job_id: jobId,
      sender_id: myId,
      sender_role: 'subcontractor',
      body,
    });
    setSending(false);
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.accent} />;

  // Whose bubble is "mine": real session matches sender_id; in demo the sub
  // (this viewer) is always the subcontractor side.
  const isMine = (m: any) => (demo ? m.sender_role === 'subcontractor' : m.sender_id === myId);

  // Index of my last message — only that one shows a read receipt.
  let lastMineIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isMine(messages[i])) { lastMineIdx = i; break; }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={88}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={m => m.id}
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => {
          const mine = isMine(item);
          return (
            <View style={[styles.bubbleWrap, mine ? styles.bubbleWrapMine : styles.bubbleWrapTheirs]}>
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.body}</Text>
              </View>
              <Text style={styles.bubbleTime}>
                {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {mine && index === lastMineIdx ? (item.read_at ? ' · Read' : ' · Sent') : ''}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.emptyMsg}>No messages yet. Start the conversation.</Text>
        }
        ListFooterComponent={
          theyreTyping ? <Text style={styles.typing}>Contractor is typing…</Text> : null
        }
      />
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={onChangeText}
          placeholder="Message..."
          placeholderTextColor={colors.textLight}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          onPress={send}
          disabled={!text.trim() || sending}
        >
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.lg },
  emptyMsg: { textAlign: 'center', color: colors.textMuted, fontSize: fontSize.sm, marginTop: spacing.xxl },
  typing: { color: colors.textMuted, fontSize: fontSize.xs, fontStyle: 'italic', paddingTop: spacing.xs, paddingLeft: spacing.xs },
  bubbleWrap: { marginBottom: spacing.xs, gap: 2 },
  bubbleWrapMine: { alignItems: 'flex-end' },
  bubbleWrapTheirs: { alignItems: 'flex-start' },
  bubble: {
    maxWidth: '75%', padding: spacing.sm, borderRadius: radius.lg,
  },
  bubbleMine: { backgroundColor: colors.accent },
  bubbleTheirs: { backgroundColor: colors.surfaceAlt },
  bubbleText: { fontSize: fontSize.md, color: colors.text, lineHeight: 20 },
  bubbleTextMine: { color: colors.white },
  bubbleTime: { fontSize: 10, color: colors.textLight },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm,
    padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: fontSize.md, color: colors.text, backgroundColor: colors.surface,
    maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: colors.accent, borderRadius: radius.lg,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendText: { color: colors.white, fontWeight: '600', fontSize: fontSize.md },
});
