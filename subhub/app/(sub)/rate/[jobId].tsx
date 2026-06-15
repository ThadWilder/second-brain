import { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import RatingStars from '@/components/RatingStars';

const TAGS = [
  { key: 'fast_payment',     label: '💰 Fast Payment' },
  { key: 'accurate_scope',   label: '📋 Job as Described' },
  { key: 'good_comms',       label: '💬 Clear Communication' },
  { key: 'safe_site',        label: '🦺 Safe Work Site' },
  { key: 'fair_changes',     label: '🤝 Fair on Change Orders' },
  { key: 'well_organized',   label: '📁 Well Organized' },
];

export default function RateContractor() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const router = useRouter();
  const [stars, setStars] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function toggleTag(key: string) {
    setSelectedTags(prev =>
      prev.includes(key) ? prev.filter(t => t !== key) : [...prev, key]
    );
  }

  async function submit() {
    if (stars === 0) { Alert.alert('Select a star rating first.'); return; }
    setSubmitting(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSubmitting(false); return; }

    const { data: job } = await supabase
      .from('jobs')
      .select('contractor_id')
      .eq('id', jobId)
      .single();

    if (!job) { setSubmitting(false); return; }

    const { error } = await supabase.from('ratings').insert({
      job_id: jobId,
      rater_id: session.user.id,
      ratee_id: job.contractor_id,
      stars,
      tags: selectedTags,
      comment: comment.trim() || null,
      rehire: stars >= 4,
    });

    setSubmitting(false);
    if (error) { Alert.alert('Error', error.message); return; }
    Alert.alert('Review submitted!', 'Thank you for your feedback.', [
      { text: 'OK', onPress: () => router.replace('/(sub)/my-jobs') },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Rate This Job</Text>
      <Text style={styles.sub}>Your review helps other subs know what to expect.</Text>

      <View style={styles.section}>
        <Text style={styles.label}>Overall Rating</Text>
        <RatingStars value={stars} interactive onRate={setStars} size="lg" />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>What stood out? (select all that apply)</Text>
        <View style={styles.tagGrid}>
          {TAGS.map(tag => {
            const on = selectedTags.includes(tag.key);
            return (
              <TouchableOpacity
                key={tag.key}
                style={[styles.tag, on && styles.tagOn]}
                onPress={() => toggleTag(tag.key)}
              >
                <Text style={[styles.tagText, on && styles.tagTextOn]}>{tag.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Comments (optional)</Text>
        <TextInput
          style={styles.input}
          value={comment}
          onChangeText={setComment}
          placeholder="Describe your experience working with this contractor..."
          placeholderTextColor={colors.textLight}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>

      <TouchableOpacity
        style={[styles.button, (submitting || stars === 0) && styles.buttonDisabled]}
        onPress={submit}
        disabled={submitting || stars === 0}
      >
        {submitting
          ? <ActivityIndicator color={colors.white} />
          : <Text style={styles.buttonText}>Submit Review</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg },
  heading: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.text },
  sub: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: -spacing.sm },
  section: { gap: spacing.sm },
  label: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tag: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  tagOn: { borderColor: colors.accent, backgroundColor: '#dcfce7' },
  tagText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '500' },
  tagTextOn: { color: '#16a34a', fontWeight: '700' },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, fontSize: fontSize.md, color: colors.text,
    backgroundColor: colors.surface, height: 100,
  },
  button: {
    backgroundColor: colors.accent, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center', marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: colors.white, fontSize: fontSize.md, fontWeight: '700' },
});
