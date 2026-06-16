import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

export default function SubChat() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const navigation = useNavigation();
  const [messages, setMessages] = useState<any[]>([]);
  const [myId, setMyId] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel>;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      setMyId(session.user.id);

      const [{ data: msgs }, { data: job }] = await Promise.all([
        supabase.from('messages').select('*').eq('job_id', jobId).order('created_at'),
        supabase.from('jobs').select('title').eq('id', jobId).single(),
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
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50);

      channel = supabase
        .channel(`sub-chat-${jobId}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'messages',
          filter: `job_id=eq.${jobId}`,
        }, payload => {
          setMessages(prev => [...prev, payload.new]);
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
        })
        .subscribe();
    });

    return () => { if (channel) supabase.removeChannel(channel); };
  }, [jobId]);

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
    setSending(true);
    setText('');
    await supabase.from('messages').insert({
      job_id: jobId,
      sender_id: myId,
      sender_role: 'subcontractor',
      body,
    });
    setSending(false);
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.accent} />;

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
        renderItem={({ item }) => {
          const mine = item.sender_id === myId;
          return (
            <View style={[styles.bubbleWrap, mine ? styles.bubbleWrapMine : styles.bubbleWrapTheirs]}>
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.body}</Text>
              </View>
              <Text style={styles.bubbleTime}>
                {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.emptyMsg}>No messages yet. Start the conversation.</Text>
        }
      />
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
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
