// Management-system API gateway for franchise operators.
//
// External field-management software posts jobs, lists jobs, and cancels
// jobs on behalf of a contractor by presenting an API key in the
// X-API-Key header (token created via the create_api_key RPC).
//
// Supported actions (POST body { action, … }):
//   create_job   — inserts a job + places the graduated hold
//   list_jobs    — returns the contractor's jobs (filterable by status)
//   cancel_job   — cancels a job and releases its hold
//
// Auth: key is looked up by sha256 hash; on match, contractor_id is
// resolved. The service-role client bypasses RLS for key lookup only;
// job operations are scoped to contractor_id.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.0.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' });

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // ── Authenticate via API key ──
  const apiKey = req.headers.get('X-API-Key') ?? req.headers.get('x-api-key');
  if (!apiKey) return json({ error: 'X-API-Key header required' }, 401);

  const keyHash = await sha256hex(apiKey);
  const { data: keyRow, error: keyErr } = await supa
    .from('api_keys')
    .select('id, contractor_id, active')
    .eq('key_hash', keyHash)
    .single();

  if (keyErr || !keyRow) return json({ error: 'Invalid API key' }, 401);
  if (!keyRow.active) return json({ error: 'API key has been revoked' }, 403);

  // Touch last_used_at (fire-and-forget)
  supa.from('api_keys').update({ last_used_at: new Date().toISOString() })
    .eq('id', keyRow.id).then(() => {});

  const contractorId: string = keyRow.contractor_id;

  // ── Route action ──
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* GET-like actions can omit body */ }
  const action = (body.action as string | undefined) ?? 'list_jobs';

  // ─── list_jobs ───────────────────────────────────────────────────────────
  if (action === 'list_jobs') {
    const status = body.status as string | undefined;
    let q = supa
      .from('jobs')
      .select('id, title, industry, city, state, status, sub_payout, created_at, claimed_at, completed_at, hold_payment_intent_id')
      .eq('contractor_id', contractorId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return json({ error: error.message }, 500);
    return json({ jobs: data, count: data?.length ?? 0 });
  }

  // ─── create_job ──────────────────────────────────────────────────────────
  if (action === 'create_job') {
    const job = body.job as Record<string, unknown> | undefined;
    if (!job) return json({ error: '`job` object is required' }, 400);

    // Required fields
    const required = ['title', 'scope_of_work', 'address', 'city', 'state', 'zip', 'sub_payout', 'estimated_days'];
    for (const f of required) {
      if (!job[f]) return json({ error: `job.${f} is required` }, 400);
    }

    const subPayout = parseFloat(job.sub_payout as string);
    if (isNaN(subPayout) || subPayout <= 0) return json({ error: 'job.sub_payout must be a positive number' }, 400);

    const installPrice = parseFloat(job.install_price as string);

    // Verify contractor has a payment method on file
    const { data: profile } = await supa
      .from('contractor_profiles')
      .select('stripe_customer_id')
      .eq('user_id', contractorId)
      .single();

    if (!profile?.stripe_customer_id) {
      return json({ error: 'No payment method on file. Add a card in the SubHub app before posting via the API.' }, 422);
    }

    // Insert job
    const { data: newJob, error: jobErr } = await supa
      .from('jobs')
      .insert({
        contractor_id: contractorId,
        title: job.title,
        industry: job.industry ?? 'Fencing',
        scope_of_work: job.scope_of_work,
        estimated_days: parseInt(job.estimated_days as string, 10) || 1,
        start_window_start: job.start_window_start ?? null,
        start_window_end: job.start_window_end ?? null,
        material_supplier: job.material_supplier ?? '',
        material_supplier_address: job.material_supplier_address ?? '',
        material_status: job.material_status ?? 'on_site',
        address: job.address,
        city: job.city,
        state: job.state,
        zip: job.zip,
        install_price: isNaN(installPrice) ? null : installPrice,
        sub_payout: subPayout,
        homeowner_name: job.homeowner_name ?? '',
        homeowner_phone: job.homeowner_phone ?? '',
        homeowner_email: job.homeowner_email ?? '',
        status: 'posted',
        project_id: job.project_id ?? null,
        external_ref: job.external_ref ?? null, // optional franchise system ID
      })
      .select('id')
      .single();

    if (jobErr || !newJob) return json({ error: jobErr?.message ?? 'Failed to create job' }, 500);

    // Place graduated hold
    const { data: holdAmountData } = await supa.rpc('posting_hold_amount', { p_contractor: contractorId });
    const holdAmount = typeof holdAmountData === 'number' ? holdAmountData : 100000;

    // Find payment method
    const customer = await stripe.customers.retrieve(profile.stripe_customer_id, {
      expand: ['invoice_settings.default_payment_method'],
    }) as any;

    let paymentMethodId: string | undefined;
    const defaultPm = customer.invoice_settings?.default_payment_method;
    paymentMethodId = typeof defaultPm === 'string' ? defaultPm : defaultPm?.id;

    if (!paymentMethodId) {
      const pms = await stripe.paymentMethods.list({ customer: profile.stripe_customer_id, type: 'card', limit: 1 });
      paymentMethodId = pms.data[0]?.id;
      if (paymentMethodId) {
        await stripe.customers.update(profile.stripe_customer_id, {
          invoice_settings: { default_payment_method: paymentMethodId },
        });
      }
    }

    if (!paymentMethodId) {
      await supa.from('jobs').delete().eq('id', newJob.id);
      return json({ error: 'No card on file. Add a payment method in the SubHub app before posting via the API.' }, 422);
    }

    let hold: Stripe.PaymentIntent;
    try {
      hold = await stripe.paymentIntents.create({
        amount: holdAmount,
        currency: 'usd',
        customer: profile.stripe_customer_id,
        payment_method: paymentMethodId,
        capture_method: 'manual',
        confirm: true,
        off_session: true,
        description: `SubHub API posting hold — job ${newJob.id}`,
        metadata: { jobId: newJob.id, type: 'posting_hold', contractorId, amount: holdAmount.toString() },
      });
    } catch (stripeErr: any) {
      await supa.from('jobs').delete().eq('id', newJob.id);
      return json({ error: `Card authorization failed: ${stripeErr.message}` }, 422);
    }

    await supa.from('jobs').update({ hold_payment_intent_id: hold.id }).eq('id', newJob.id);

    // Trigger saved-search alerts (best-effort)
    supa.functions.invoke('match-saved-searches', { body: { jobId: newJob.id } }).catch(() => {});

    return json({
      job_id: newJob.id,
      hold_id: hold.id,
      hold_amount: holdAmount / 100,
      status: 'posted',
    }, 201);
  }

  // ─── cancel_job ──────────────────────────────────────────────────────────
  if (action === 'cancel_job') {
    const jobId = body.job_id as string | undefined;
    if (!jobId) return json({ error: 'job_id is required' }, 400);

    const { data: jobRow, error: jobErr } = await supa
      .from('jobs')
      .select('id, status, hold_payment_intent_id, contractor_id')
      .eq('id', jobId)
      .single();

    if (jobErr || !jobRow) return json({ error: 'Job not found' }, 404);
    if (jobRow.contractor_id !== contractorId) return json({ error: 'Not authorized' }, 403);
    if (['complete', 'disputed'].includes(jobRow.status)) {
      return json({ error: `Cannot cancel a job with status "${jobRow.status}"` }, 422);
    }

    // Release hold if present
    if (jobRow.hold_payment_intent_id) {
      try {
        await stripe.paymentIntents.cancel(jobRow.hold_payment_intent_id);
      } catch {
        // Already cancelled or captured — proceed
      }
      await supa.from('jobs').update({ hold_payment_intent_id: null }).eq('id', jobId);
    }

    await supa.from('jobs').update({ status: 'cancelled' }).eq('id', jobId);

    return json({ job_id: jobId, status: 'cancelled' });
  }

  return json({ error: `Unknown action "${action}". Supported: create_job, list_jobs, cancel_job` }, 400);
});
