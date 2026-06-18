import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { getProjects, createProject } from '@/lib/projects';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import type { Project } from '@/lib/types';

const STATUS_META: Record<string, { label: string; color: string }> = {
  active:    { label: 'Active',    color: colors.statusInProgress },
  on_hold:   { label: 'On Hold',   color: colors.warning },
  complete:  { label: 'Complete',  color: colors.statusComplete },
  cancelled: { label: 'Cancelled', color: colors.textLight },
};

export default function ProjectsScreen() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [customer, setCustomer] = useState('');
  const [desc, setDesc] = useState('');

  const load = useCallback(() => {
    getProjects().then(p => { setProjects(p); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function submit() {
    if (!title.trim()) { Alert.alert('Required', 'Give the project a title.'); return; }
    setCreating(true);
    try {
      const p = await createProject({
        title: title.trim(),
        customer_name: customer.trim() || undefined,
        description: desc.trim() || undefined,
      });
      setTitle(''); setCustomer(''); setDesc(''); setShowForm(false);
      router.push(`/(contractor)/projects/${p.id}` as any);
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={styles.h1}>Projects</Text>
          <Text style={styles.sub}>Coordinate multi-trade jobs for one customer under a single tile.</Text>
        </View>
        <TouchableOpacity style={styles.newBtn} onPress={() => setShowForm(v => !v)}>
          <Text style={styles.newBtnText}>{showForm ? '✕' : '+ New'}</Text>
        </TouchableOpacity>
      </View>

      {showForm && (
        <View style={styles.form}>
          <Text style={styles.label}>Project title</Text>
          <TextInput style={styles.input} value={title} onChangeText={setTitle}
            placeholder="e.g. Henderson backyard — fence + deck + lighting" placeholderTextColor={colors.textLight} />
          <Text style={styles.label}>Customer name</Text>
          <TextInput style={styles.input} value={customer} onChangeText={setCustomer}
            placeholder="Homeowner / account name" placeholderTextColor={colors.textLight} />
          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput style={[styles.input, styles.multiline]} value={desc} onChangeText={setDesc}
            placeholder="Sequencing or context — e.g. fence before deck" placeholderTextColor={colors.textLight} multiline />
          <TouchableOpacity style={[styles.button, creating && styles.buttonDisabled]} onPress={submit} disabled={creating}>
            {creating ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Create Project</Text>}
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : projects.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyText}>No projects yet. Create one to group related jobs for a single customer.</Text>
        </View>
      ) : (
        projects.map(p => {
          const meta = STATUS_META[p.status] ?? STATUS_META.active;
          const prog = p.progress;
          const pct = prog && prog.total_jobs > 0 ? Math.round((prog.complete_jobs / prog.total_jobs) * 100) : 0;
          return (
            <TouchableOpacity key={p.id} style={styles.card} onPress={() => router.push(`/(contractor)/projects/${p.id}` as any)}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={1}>{p.title}</Text>
                <View style={[styles.badge, { backgroundColor: meta.color + '22' }]}>
                  <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>
              {p.customer_name ? <Text style={styles.cardCustomer}>👤 {p.customer_name}</Text> : null}
              {prog && (
                <>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${pct}%` }]} />
                  </View>
                  <View style={styles.statRow}>
                    <Text style={styles.stat}>{prog.complete_jobs}/{prog.total_jobs} jobs done</Text>
                    <Text style={styles.stat}>
                      ${prog.total_payout.toLocaleString('en-US', { maximumFractionDigits: 0 })} total payout
                    </Text>
                  </View>
                </>
              )}
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flex: { flex: 1 },
  h1: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  sub: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  newBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  newBtnText: { color: colors.white, fontWeight: '700', fontSize: fontSize.sm },
  form: { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, fontSize: fontSize.md, color: colors.text, backgroundColor: colors.surface },
  multiline: { height: 80, textAlignVertical: 'top' },
  button: { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.xs },
  buttonText: { color: colors.white, fontWeight: '700', fontSize: fontSize.md },
  buttonDisabled: { opacity: 0.5 },
  loader: { marginTop: spacing.xxl },
  empty: { alignItems: 'center', padding: spacing.xxl, gap: spacing.md },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: fontSize.md, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  card: { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { flex: 1, fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  badge: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { fontSize: fontSize.xs, fontWeight: '700' },
  cardCustomer: { fontSize: fontSize.sm, color: colors.textMuted },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: colors.statusComplete },
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
});
