// Boost a job posting for better visibility on the sub job board.
// Charges the contractor 1.5% of the total job (install_price) off-session
// against their saved card, then flags the job as boosted. The flag is set
// here (service role) only after the charge succeeds, so a boost can never be
// faked from the client.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.0.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' });

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BOOST_RATE = 0.015; // 1.5% of the total job

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const authHeader = req.headers.get('Authorization');
    const { data: { user } } = await supabase.auth.getUser(authHeader?.split(' ')[1]);
    if (!user) throw new Error('Unauthorized');

    const { jobId } = await req.json();
    if (!jobId) throw new Error('jobId required');

    const { data: job } = await supabase
      .from('jobs')
      .select('id, contractor_id, status, install_price, boosted')
      .eq('id', jobId)
      .single();

    if (!job) throw new Error('Job not found');
    if (job.contractor_id !== user.id) throw new Error('Not your job');
    if (job.status !== 'posted') throw new Error('Only open (posted) jobs can be boosted');
    if (job.boosted) throw new Error('This job is already boosted');

    // Fee is 1.5% of the total job, with Stripe's $0.50 minimum charge.
    const feeCents = Math.max(50, Math.round(Number(job.install_price) * BOOST_RATE * 100));

    const { data: profile } = await supabase
      .from('contractor_profiles')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      throw new Error('No payment method on file. Add a card in your profile before boosting.');
    }

    // Find the contractor's default saved card (same fallback logic as hold-payment).
    const customer = await stripe.customers.retrieve(profile.stripe_customer_id, {
      expand: ['invoice_settings.default_payment_method'],
    }) as any;

    const defaultPm = customer.invoice_settings?.default_payment_method;
    let paymentMethodId = typeof defaultPm === 'string' ? defaultPm : defaultPm?.id;

    if (!paymentMethodId) {
      const pms = await stripe.paymentMethods.list({
        customer: profile.stripe_customer_id,
        type: 'card',
        limit: 1,
      });
      paymentMethodId = pms.data[0]?.id;
      if (paymentMethodId) {
        await stripe.customers.update(profile.stripe_customer_id, {
          invoice_settings: { default_payment_method: paymentMethodId },
        });
      }
    }

    if (!paymentMethodId) throw new Error('No card on file. Add a payment method in your profile before boosting.');

    const charge = await stripe.paymentIntents.create({
      amount: feeCents,
      currency: 'usd',
      customer: profile.stripe_customer_id,
      payment_method: paymentMethodId,
      confirm: true,
      off_session: true,
      description: `SubHub job boost — job ${jobId}`,
      metadata: { jobId, type: 'job_boost', contractorId: user.id },
    });

    if (charge.status !== 'succeeded') {
      throw new Error(`Boost charge not completed (status: ${charge.status})`);
    }

    await supabase
      .from('jobs')
      .update({ boosted: true, boosted_at: new Date().toISOString() })
      .eq('id', jobId)
      .eq('contractor_id', user.id);

    return new Response(
      JSON.stringify({ boosted: true, amount: feeCents / 100 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
