import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import RatingStars from '@/components/RatingStars';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import type { Job } from '@/lib/types';

export default function SubJobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    fetchJob();
  }, [id]);

  async function fetchJob() {
    const { data } = await supabase
      .from('jobs')
      .select('*, contractor:contractor_profiles(*)')
      .eq('id', id)
      .single();
    setJob(data);
    setLoading(false);
  }

  async function handleClaim() {
    Alert.alert(
      'Claim This Job',
      `You're committing to complete this job for ${formatCurrency(job!.sub_payout)}. A SubHub fee will be deducted from your payout.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Claim Job',
          onPress: async () => {
            setClaiming(true);
            const { data: { user } } = await supabase.auth.getUser();
            const { error } = await supabase
              .from('jobs')
              .update({ status: 'claimed', claimed_by: user!.id, claimed_at: new Date().toISOString() })
              .eq('id', id);
            setClaiming(false);
            if (error) { Alert.alert('Error', error.message); return; }
            router.replace('/(sub)/my-jobs');
          },
        },
      ]
    );
  }

  if (loading) return <ActivityIndicator style={styles.loader} color={colors.accent} />;
  if (!job) return <Text style={styles.notFound}>Job not found.</Text>;

  const payout = formatCurrency(job.sub_payout);
  const canClaim = job.status === 'posted';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.payout}>{payout}</Text>
          <Text style={styles.payoutLabel}>your payout</Text>
        </View>

        <Text style={styles.title}>{job.title}</Text>
        <Text style={styles.location}>📍 {job.city}, {job.state} · {job.estimated_days} day{job.estimated_days !== 1 ? 's' : ''}</Text>

        {job.contractor && (
          <View style={styles.contractorRow}>
            <View style={styles.flex}>
              <Text style={styles.contractorName}>{job.contractor.business_name}</Text>
              <RatingStars value={job.contractor.rating} count={job.contractor.rating_count} size="sm" />
            </View>
          </View>
        )}

        <Divider />

        <Section title="Scope of Work">
          <Text style={styles.body}>{job.scope_of_work}</Text>
        </Section>

        <Section title="Materials">
          <InfoRow label="Supplier" value={job.material_supplier} />
          <InfoRow label="Supplier Location" value={job.material_supplier_address} />
          <InfoRow label="Material Status" value={materialStatusLabel(job.material_status)} highlight />
        </Section>

        <Section title="Schedule">
          <InfoRow label="Start Window" value={`${job.start_window_start} → ${job.start_window_end}`} />
          <InfoRow label="Est. Days to Complete" value={`${job.estimated_days} day${job.estimated_days !== 1 ? 's' : ''}`} />
        </Section>

        <Section title="Closeout Requirements">
          <Text style={styles.body}>• Before, during, and after photos required</Text>
          <Text style={styles.body}>• Customer digital sign-off to close job</Text>
          <Text style={styles.body}>• All communication through SubHub only</Text>
        </Section>
      </ScrollView>

      {canClaim && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.claimButton} onPress={handleClaim} disabled={claiming}>
            {claiming
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.claimText}>Claim Job — {payout}</Text>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, highlight && styles.infoValueHighlight]}>{value}</Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function materialStatusLabel(status: Job['material_status']) {
  if (status === 'on_site') return '✅ On-site — ready to install';
  if (status === 'local') return '📍 Local pickup required (~25 mi)';
  return '🚚 Distant — delivery timeline applies';
}

function formatCurrency(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loader: { marginTop: spacing.xxl },
  notFound: { textAlign: 'center', marginTop: spacing.xxl, color: colors.textMuted },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: 120 },
  hero: { alignItems: 'center', paddingVertical: spacing.lg },
  payout: { fontSize: 48, fontWeight: '800', color: colors.accent },
  payoutLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  title: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.text },
  location: { fontSize: fontSize.sm, color: colors.textMuted },
  contractorRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    padding: spacing.md, borderRadius: radius.md, gap: spacing.md,
  },
  flex: { flex: 1 },
  contractorName: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  divider: { height: 1, backgroundColor: colors.border },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  body: { fontSize: fontSize.md, color: colors.text, lineHeight: 22 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md },
  infoLabel: { fontSize: fontSize.sm, color: colors.textMuted, flex: 1 },
  infoValue: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500', flex: 2, textAlign: 'right' },
  infoValueHighlight: { color: colors.primary, fontWeight: '600' },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: spacing.lg, backgroundColor: colors.background,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  claimButton: {
    backgroundColor: colors.accent, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center',
  },
  claimText: { color: colors.white, fontSize: fontSize.lg, fontWeight: '700' },
});
