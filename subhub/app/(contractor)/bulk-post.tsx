// Franchise bulk-posting wizard.
//
// A contractor fills in a shared template (industry, material info,
// date window) then adds individual job rows (title, address, payout).
// Jobs are posted sequentially so the graduated hold applies correctly:
// the first job in the batch gets the $1,000 hold, every additional
// concurrent job gets $250.
import { useState, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import { getMyFeeStatus, feeWaiverMessage, type FeeStatus } from '@/lib/fees';
import type { MaterialStatus } from '@/lib/types';

const INDUSTRIES = ['Fencing', 'Decking', 'Pergola / Shade', 'Gates', 'Retaining Walls', 'General'];

const MATERIAL_OPTIONS: { label: string; value: MaterialStatus }[] = [
  { label: 'On-site', value: 'on_site' },
  { label: 'Local pickup', value: 'local' },
  { label: 'Distant', value: 'distant' },
];

interface JobRow {
  localId: string;
  title: string;
  scope_of_work: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  sub_payout: string;
  homeowner_name: string;
  homeowner_phone: string;
  estimated_days_override: string; // '' means use template value
  expanded: boolean;
  // runtime state
  status: 'idle' | 'posting' | 'done' | 'error';
  errorMsg: string;
  jobId: string | null;
  holdAmount: number | null;
}

let rowCounter = 0;
function makeRow(): JobRow {
  return {
    localId: `row_${++rowCounter}`,
    title: '',
    scope_of_work: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    sub_payout: '',
    homeowner_name: '',
    homeowner_phone: '',
    estimated_days_override: '',
    expanded: false,
    status: 'idle',
    errorMsg: '',
    jobId: null,
    holdAmount: null,
  };
}

function Field({
  label, value, onChangeText, placeholder, multiline, keyboardType, short,
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; multiline?: boolean; keyboardType?: any; short?: boolean;
}) {
  return (
    <View style={[s.field, short && s.fieldShort]}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={[s.input, multiline && s.inputMulti]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textLight}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize="words"
      />
    </View>
  );
}

export default function BulkPostScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);

  const [hasPaymentMethod, setHasPaymentMethod] = useState<boolean | null>(null);
  const [feeStatus, setFeeStatus] = useState<FeeStatus | null>(null);
  const [feeAgreed, setFeeAgreed] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postedCount, setPostedCount] = useState(0);
  const [error, setError] = useState('');

  const [template, setTemplate] = useState({
    industry: 'Fencing',
    material_status: 'on_site' as MaterialStatus,
    material_supplier: '',
    material_supplier_address: '',
    estimated_days: '1',
    start_window_start: '',
    start_window_end: '',
  });

  const [rows, setRows] = useState<JobRow[]>([makeRow(), makeRow()]);

  useFocusEffect(
    useCallback(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) return;
        supabase.from('contractor_profiles')
          .select('stripe_customer_id')
          .eq('user_id', session.user.id)
          .single()
          .then(({ data }) => setHasPaymentMethod(!!data?.stripe_customer_id));
      });
      getMyFeeStatus().then(setFeeStatus).catch(() => {});
    }, [])
  );

  function setTpl<K extends keyof typeof template>(key: K) {
    return (val: (typeof template)[K]) => setTemplate(t => ({ ...t, [key]: val }));
  }

  function updateRow(localId: string, patch: Partial<JobRow>) {
    setRows(rs => rs.map(r => r.localId === localId ? { ...r, ...patch } : r));
  }

  function addRow() {
    setRows(rs => [...rs, makeRow()]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }

  function removeRow(localId: string) {
    setRows(rs => rs.filter(r => r.localId !== localId));
  }

  function validateAll(): string | null {
    if (!template.material_supplier) return 'Material supplier is required in the shared template.';
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const num = i + 1;
      if (!r.title) return `Row ${num}: Job title is required.`;
      if (!r.address || !r.city || !r.state || !r.zip) return `Row ${num}: Full address is required.`;
      if (!r.sub_payout) return `Row ${num}: Sub payout is required.`;
      const sp = parseFloat(r.sub_payout);
      if (isNaN(sp) || sp <= 0) return `Row ${num}: Sub payout must be a dollar amount greater than zero.`;
      if (!r.homeowner_name || !r.homeowner_phone) return `Row ${num}: Homeowner name and phone are required.`;
    }
    if (!feeAgreed) return 'You must acknowledge the platform fee before posting.';
    return null;
  }

  async function handlePostAll() {
    setError('');
    const validationError = validateAll();
    if (validationError) { setError(validationError); return; }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Session expired. Please sign in again.'); return; }

    setPosting(true);
    setPostedCount(0);

    let successCount = 0;
    let totalHold = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      updateRow(row.localId, { status: 'posting', errorMsg: '' });

      const subPayout = parseFloat(row.sub_payout);
      const days = row.estimated_days_override
        ? parseInt(row.estimated_days_override, 10) || parseInt(template.estimated_days, 10) || 1
        : parseInt(template.estimated_days, 10) || 1;

      // Insert job
      const { data: newJob, error: jobErr } = await supabase.from('jobs').insert({
        contractor_id: user.id,
        title: row.title,
        industry: template.industry,
        scope_of_work: row.scope_of_work || `${template.industry} installation — see job details.`,
        estimated_days: days,
        start_window_start: template.start_window_start || null,
        start_window_end: template.start_window_end || null,
        material_supplier: template.material_supplier,
        material_supplier_address: template.material_supplier_address,
        material_status: template.material_status,
        address: row.address,
        city: row.city,
        state: row.state,
        zip: row.zip,
        install_price: null,
        sub_payout: subPayout,
        homeowner_name: row.homeowner_name,
        homeowner_phone: row.homeowner_phone,
        homeowner_email: '',
        status: 'posted',
      }).select('id').single();

      if (jobErr || !newJob) {
        updateRow(row.localId, { status: 'error', errorMsg: jobErr?.message ?? 'Failed to create job.' });
        setError(`Job ${i + 1} (${row.title}) failed to post. Remaining jobs were not posted.`);
        setPosting(false);
        return;
      }

      // Place graduated hold
      const { data: holdData, error: holdErr } = await supabase.functions.invoke('hold-payment', {
        body: { jobId: newJob.id },
      });

      if (holdErr || holdData?.error) {
        await supabase.from('jobs').delete().eq('id', newJob.id);
        const msg = holdData?.error ?? holdErr?.message ?? 'Card authorization failed.';
        updateRow(row.localId, { status: 'error', errorMsg: msg });
        setError(`Job ${i + 1} (${row.title}): ${msg}. Remaining jobs were not posted.`);
        setPosting(false);
        return;
      }

      const holdAmt = typeof holdData?.amount === 'number' ? holdData.amount : 1000;
      totalHold += holdAmt;
      successCount++;
      updateRow(row.localId, { status: 'done', jobId: newJob.id, holdAmount: holdAmt });
      setPostedCount(successCount);

      // Notify saved-search alerts (best-effort)
      supabase.functions.invoke('match-saved-searches', { body: { jobId: newJob.id } }).catch(() => {});
    }

    setPosting(false);
    Alert.alert(
      `${successCount} Job${successCount === 1 ? '' : 's'} Posted!`,
      `Total authorization hold: $${totalHold.toLocaleString()}.\n\nHolds are released when jobs are cancelled or replaced by full payment.`,
      [{ text: 'View My Jobs', onPress: () => router.replace('/(contractor)/') }]
    );
  }

  if (hasPaymentMethod === false) {
    return (
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        <View style={s.gate}>
          <Text style={s.gateTitle}>Payment Method Required</Text>
          <Text style={s.gateBody}>Add a payment method to your profile before bulk-posting jobs.</Text>
          <TouchableOpacity style={s.btn} onPress={() => router.navigate('/(contractor)/profile')}>
            <Text style={s.btnText}>Add Payment Method →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  const readyCount = rows.filter(r => r.status === 'done').length;
  const allDone = readyCount === rows.length && rows.length > 0;

  return (
    <ScrollView ref={scrollRef} style={s.container} contentContainerStyle={s.content}>
      <Text style={s.headline}>Bulk Post Jobs</Text>
      <Text style={s.sub}>
        Set shared details once, then add one row per job. Jobs post sequentially —
        first job: $1,000 hold; each additional: $250.
      </Text>

      {feeStatus && feeStatus.role === 'contractor' && feeStatus.freeRemaining > 0 && (
        <View style={s.waiver}><Text style={s.waiverText}>{feeWaiverMessage(feeStatus)}</Text></View>
      )}

      {/* ── Shared Template ── */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Shared Template</Text>

        <Text style={s.label}>Trade / Industry</Text>
        <View style={s.chipRow}>
          {INDUSTRIES.map(ind => (
            <TouchableOpacity
              key={ind}
              style={[s.chip, template.industry === ind && s.chipOn]}
              onPress={() => setTpl('industry')(ind)}
            >
              <Text style={[s.chipText, template.industry === ind && s.chipTextOn]}>{ind}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.label}>Materials</Text>
        <View style={s.chipRow}>
          {MATERIAL_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[s.chip, template.material_status === opt.value && s.chipOn]}
              onPress={() => setTpl('material_status')(opt.value)}
            >
              <Text style={[s.chipText, template.material_status === opt.value && s.chipTextOn]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Field label="Material Supplier *" value={template.material_supplier}
          onChangeText={setTpl('material_supplier')} placeholder="Supplier name" />
        <Field label="Supplier Address" value={template.material_supplier_address}
          onChangeText={setTpl('material_supplier_address')} placeholder="Optional" />

        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Field label="Default Days to Complete" value={template.estimated_days}
              onChangeText={setTpl('estimated_days')} keyboardType="number-pad" />
          </View>
        </View>

        <View style={s.row}>
          <View style={{ flex: 1, marginRight: spacing.sm }}>
            <Field label="Earliest Start" value={template.start_window_start}
              onChangeText={setTpl('start_window_start')} placeholder="MM/DD/YYYY" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Latest Start" value={template.start_window_end}
              onChangeText={setTpl('start_window_end')} placeholder="MM/DD/YYYY" />
          </View>
        </View>
      </View>

      {/* ── Job Rows ── */}
      <Text style={s.sectionTitle}>Jobs ({rows.length})</Text>

      {rows.map((row, idx) => (
        <View key={row.localId} style={[s.rowCard, row.status === 'error' && s.rowCardError, row.status === 'done' && s.rowCardDone]}>
          <View style={s.rowHeader}>
            <Text style={s.rowNum}>Job {idx + 1}</Text>
            {row.status === 'posting' && <ActivityIndicator size="small" color={colors.primary} />}
            {row.status === 'done' && (
              <Text style={s.rowDone}>
                ✓ Posted  •  ${row.holdAmount?.toLocaleString()} hold
              </Text>
            )}
            {row.status === 'error' && <Text style={s.rowErr}>✗ Failed</Text>}
            {row.status === 'idle' && rows.length > 1 && (
              <TouchableOpacity onPress={() => removeRow(row.localId)}>
                <Text style={s.removeBtn}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>

          {row.errorMsg ? <Text style={s.rowErrMsg}>{row.errorMsg}</Text> : null}

          <Field label="Job Title *" value={row.title}
            onChangeText={v => updateRow(row.localId, { title: v })}
            placeholder="e.g. 6ft Cedar Privacy Fence — 150 LF" />

          <View style={s.row}>
            <View style={{ flex: 2, marginRight: spacing.sm }}>
              <Field label="Street Address *" value={row.address}
                onChangeText={v => updateRow(row.localId, { address: v })} placeholder="123 Main St" />
            </View>
          </View>
          <View style={s.row}>
            <View style={{ flex: 2, marginRight: spacing.sm }}>
              <Field label="City *" value={row.city}
                onChangeText={v => updateRow(row.localId, { city: v })} />
            </View>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <Field label="State *" value={row.state}
                onChangeText={v => updateRow(row.localId, { state: v })} placeholder="TX" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="ZIP *" value={row.zip}
                onChangeText={v => updateRow(row.localId, { zip: v })} keyboardType="number-pad" />
            </View>
          </View>

          <View style={s.row}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <Field label="Homeowner Name *" value={row.homeowner_name}
                onChangeText={v => updateRow(row.localId, { homeowner_name: v })} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Homeowner Phone *" value={row.homeowner_phone}
                onChangeText={v => updateRow(row.localId, { homeowner_phone: v })}
                keyboardType="phone-pad" />
            </View>
          </View>

          <View style={s.row}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <Field label="Sub Payout ($) *" value={row.sub_payout}
                onChangeText={v => updateRow(row.localId, { sub_payout: v })}
                keyboardType="decimal-pad" placeholder="0.00" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label={`Days (default: ${template.estimated_days})`}
                value={row.estimated_days_override}
                onChangeText={v => updateRow(row.localId, { estimated_days_override: v })}
                keyboardType="number-pad" placeholder="Override" />
            </View>
          </View>

          <TouchableOpacity
            onPress={() => updateRow(row.localId, { expanded: !row.expanded })}
            style={s.expandToggle}
          >
            <Text style={s.expandText}>
              {row.expanded ? '▲ Hide scope notes' : '▼ Add scope notes (optional)'}
            </Text>
          </TouchableOpacity>

          {row.expanded && (
            <Field label="Scope of Work" value={row.scope_of_work}
              onChangeText={v => updateRow(row.localId, { scope_of_work: v })}
              placeholder="Job-specific details (or leave blank to use template industry)" multiline />
          )}
        </View>
      ))}

      <TouchableOpacity style={s.addRowBtn} onPress={addRow} disabled={posting}>
        <Text style={s.addRowText}>+ Add Another Job</Text>
      </TouchableOpacity>

      {/* ── Fee acknowledgement ── */}
      <View style={s.feeCard}>
        <Text style={s.feeTitle}>Platform Fee</Text>
        <Text style={s.feeBody}>
          SubHub deducts a 10% platform fee from the sub's payout on each job. An authorization
          hold is placed on your card at posting ($1,000 first job, $250 each additional) and
          released when the job is cancelled or paid out.
        </Text>
        <TouchableOpacity style={s.checkRow} onPress={() => setFeeAgreed(v => !v)}>
          <View style={[s.checkbox, feeAgreed && s.checkboxOn]}>
            {feeAgreed && <Text style={s.checkmark}>✓</Text>}
          </View>
          <Text style={s.checkLabel}>I understand the platform fee and authorization hold policy.</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={s.error}>{error}</Text> : null}

      {posting ? (
        <View style={s.progress}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={s.progressText}>
            Posting job {postedCount + 1} of {rows.length}…
          </Text>
        </View>
      ) : allDone ? (
        <View style={s.allDone}>
          <Text style={s.allDoneText}>All {rows.length} jobs posted!</Text>
          <TouchableOpacity style={s.btn} onPress={() => router.replace('/(contractor)/')}>
            <Text style={s.btnText}>View My Jobs →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[s.btn, s.btnPost]}
          onPress={handlePostAll}
          disabled={posting || rows.length === 0}
        >
          <Text style={s.btnText}>
            Post {rows.length} Job{rows.length === 1 ? '' : 's'}
          </Text>
        </TouchableOpacity>
      )}

      <View style={{ height: spacing.xl * 2 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  headline: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  sub: { fontSize: fontSize.sm, color: colors.textLight, marginBottom: spacing.md, lineHeight: 20 },
  waiver: { backgroundColor: '#fef3c7', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  waiverText: { fontSize: fontSize.sm, color: '#92400e' },
  card: {
    backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  cardTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  rowCard: {
    backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  rowCardError: { borderColor: '#ef4444', backgroundColor: '#fef2f2' },
  rowCardDone: { borderColor: '#22c55e', backgroundColor: '#f0fdf4' },
  rowHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  rowNum: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  rowDone: { fontSize: fontSize.xs, color: '#16a34a', fontWeight: '600' },
  rowErr: { fontSize: fontSize.xs, color: '#ef4444', fontWeight: '600' },
  rowErrMsg: { fontSize: fontSize.sm, color: '#ef4444', marginBottom: spacing.sm },
  removeBtn: { fontSize: fontSize.sm, color: '#ef4444', fontWeight: '600' },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text, marginBottom: 4 },
  field: { marginBottom: spacing.sm },
  fieldShort: { flex: 0, width: 100 },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.sm, fontSize: fontSize.md, color: colors.text,
    backgroundColor: colors.background,
  },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background,
  },
  chipOn: { borderColor: colors.primary, backgroundColor: '#dbeafe' },
  chipText: { fontSize: fontSize.sm, color: colors.textLight },
  chipTextOn: { color: colors.primary, fontWeight: '700' },
  expandToggle: { marginTop: spacing.xs, marginBottom: spacing.xs },
  expandText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },
  addRowBtn: {
    alignItems: 'center', padding: spacing.md, borderRadius: radius.lg,
    borderWidth: 2, borderColor: colors.primary, borderStyle: 'dashed',
    marginBottom: spacing.lg,
  },
  addRowText: { fontSize: fontSize.md, color: colors.primary, fontWeight: '700' },
  feeCard: {
    backgroundColor: '#f8fafc', borderRadius: radius.lg, padding: spacing.lg,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  feeTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  feeBody: { fontSize: fontSize.sm, color: colors.textLight, lineHeight: 20, marginBottom: spacing.md },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  checkbox: {
    width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  checkboxOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  checkmark: { color: colors.white, fontSize: 14, fontWeight: '700' },
  checkLabel: { flex: 1, fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },
  error: { color: '#ef4444', fontSize: fontSize.sm, marginBottom: spacing.md, fontWeight: '600' },
  progress: { alignItems: 'center', padding: spacing.xl },
  progressText: { marginTop: spacing.md, fontSize: fontSize.md, color: colors.text },
  allDone: { alignItems: 'center', padding: spacing.lg },
  allDoneText: { fontSize: fontSize.lg, fontWeight: '700', color: '#16a34a', marginBottom: spacing.md },
  btn: {
    backgroundColor: colors.primary, padding: spacing.md, borderRadius: radius.lg,
    alignItems: 'center', marginBottom: spacing.sm,
  },
  btnPost: { marginTop: spacing.sm },
  btnText: { color: colors.white, fontWeight: '700', fontSize: fontSize.md },
  gate: { alignItems: 'center', padding: spacing.xl * 2 },
  gateTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  gateBody: { fontSize: fontSize.md, color: colors.textLight, textAlign: 'center', marginBottom: spacing.lg },
});
