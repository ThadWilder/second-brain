import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, TextInput, Switch,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import type { SavedSearch } from '@/lib/types';

const SKILL_OPTIONS = ['Fencing', 'Decking', 'Pergola / Shade', 'Gates', 'Retaining Walls', 'General'];

function summarize(s: SavedSearch): string {
  const parts: string[] = [];
  if (s.skills && s.skills.length) parts.push(s.skills.join(', '));
  if (s.zip) parts.push(s.zip);
  if (s.min_payout != null) {
    const k = s.min_payout >= 1000 ? `$${Math.round(s.min_payout / 1000)}k+` : `$${s.min_payout}+`;
    parts.push(k);
  }
  return parts.length ? parts.join(' · ') : 'Any matching job';
}

export default function SavedSearchesScreen() {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // form state
  const [label, setLabel] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [zip, setZip] = useState('');
  const [minPayout, setMinPayout] = useState('');
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSearches([]); setLoading(false); return; }

    const { data: prof } = await supabase
      .from('sub_profiles').select('id').eq('user_id', user.id).single();

    if (!prof) { setSearches([]); setLoading(false); return; }
    setProfileId(prof.id);

    const { data } = await supabase
      .from('saved_searches')
      .select('*')
      .eq('sub_id', prof.id)
      .order('created_at', { ascending: false });

    setSearches((data as SavedSearch[]) ?? []);
    setLoading(false);
  }

  function toggleSkill(skill: string) {
    setSkills(prev => prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]);
  }

  function resetForm() {
    setLabel(''); setSkills([]); setZip(''); setMinPayout(''); setNotify(true);
  }

  async function saveSearch() {
    if (!profileId) return;
    setSaving(true);
    await supabase.from('saved_searches').insert({
      sub_id: profileId,
      label: label.trim() || null,
      skills,
      zip: zip.trim() || null,
      min_payout: minPayout ? Number(minPayout) : null,
      notify,
    });
    setSaving(false);
    resetForm();
    setShowForm(false);
    load();
  }

  async function setNotifyFor(id: string, value: boolean) {
    setSearches(prev => prev.map(s => s.id === id ? { ...s, notify: value } : s));
    await supabase.from('saved_searches').update({ notify: value }).eq('id', id);
  }

  async function remove(id: string) {
    setSearches(prev => prev.filter(s => s.id !== id));
    await supabase.from('saved_searches').delete().eq('id', id);
  }

  if (loading) {
    return <ActivityIndicator style={styles.loader} color={colors.accent} />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity
        style={styles.newBtn}
        onPress={() => setShowForm(v => !v)}
      >
        <Text style={styles.newBtnText}>{showForm ? '✕ Cancel' : '＋ New Alert'}</Text>
      </TouchableOpacity>

      {showForm && (
        <View style={styles.form}>
          <Text style={styles.formLabel}>Label</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. High-pay fencing near me"
            placeholderTextColor={colors.textLight}
            value={label}
            onChangeText={setLabel}
          />

          <Text style={styles.formLabel}>Skills</Text>
          <View style={styles.chipWrap}>
            {SKILL_OPTIONS.map(skill => {
              const active = skills.includes(skill);
              return (
                <TouchableOpacity
                  key={skill}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => toggleSkill(skill)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{skill}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.formLabel}>ZIP</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 90210"
            placeholderTextColor={colors.textLight}
            keyboardType="number-pad"
            value={zip}
            onChangeText={setZip}
          />

          <Text style={styles.formLabel}>Minimum payout ($)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 1000"
            placeholderTextColor={colors.textLight}
            keyboardType="number-pad"
            value={minPayout}
            onChangeText={setMinPayout}
          />

          <View style={styles.notifyRow}>
            <Text style={styles.formLabel}>Notify me</Text>
            <Switch
              value={notify}
              onValueChange={setNotify}
              trackColor={{ true: colors.accent, false: colors.border }}
            />
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={saveSearch}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Alert'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {searches.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🔔</Text>
          <Text style={styles.emptyText}>No alerts yet. Create one to get notified when matching jobs are posted.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {searches.map(s => (
            <View key={s.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{s.label || summarize(s)}</Text>
                <TouchableOpacity onPress={() => remove(s.id)} hitSlop={8}>
                  <Text style={styles.deleteBtn}>🗑</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.cardSummary}>{summarize(s)}</Text>

              <View style={styles.metaRow}>
                {!!(s.skills && s.skills.length) && (
                  <Text style={styles.meta}>Skills: {s.skills.join(', ')}</Text>
                )}
                {!!s.zip && <Text style={styles.meta}>ZIP: {s.zip}</Text>}
                {s.min_payout != null && <Text style={styles.meta}>Min: ${s.min_payout}</Text>}
              </View>

              <View style={styles.notifyRow}>
                <Text style={styles.notifyLabel}>Notifications</Text>
                <Switch
                  value={s.notify}
                  onValueChange={(v) => setNotifyFor(s.id, v)}
                  trackColor={{ true: colors.accent, false: colors.border }}
                />
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  loader: { flex: 1, marginTop: spacing.xxl },

  newBtn: {
    backgroundColor: colors.accent, borderRadius: radius.md,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  newBtnText: { color: colors.white, fontSize: fontSize.md, fontWeight: '700' },

  form: {
    backgroundColor: colors.background, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm,
  },
  formLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.sm, fontSize: fontSize.md, color: colors.text, backgroundColor: colors.surface,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
  chipTextActive: { color: colors.white },
  notifyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.xs },

  saveBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.xs },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: colors.white, fontSize: fontSize.md, fontWeight: '700' },

  list: { gap: spacing.sm },
  card: {
    backgroundColor: colors.background, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.text, flex: 1, paddingRight: spacing.sm },
  deleteBtn: { fontSize: 20 },
  cardSummary: { fontSize: fontSize.sm, color: colors.accent, fontWeight: '600' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingTop: spacing.xs },
  meta: { fontSize: fontSize.xs, color: colors.textMuted },
  notifyLabel: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600' },

  empty: { alignItems: 'center', padding: spacing.xxl, gap: spacing.md },
  emptyIcon: { fontSize: 44 },
  emptyText: { fontSize: fontSize.md, color: colors.textMuted, textAlign: 'center' },
});
