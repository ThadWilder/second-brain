import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.0.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' });

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Load job + contractor profile
    const { data: job } = await supabase
      .from('jobs')
      .select('*, contractor:contractor_profiles!contractor_id(*)')
      .eq('id', jobId)
      .single();

    if (!job) throw new Error('Job not found');
    if (job.contractor_id !== user.id) throw new Error('Not your job');
    if (job.status !== 'pending_review') throw new Error('Job not ready for payment');

    const { data: sub } = await supabase
      .from('sub_profiles')
      .select('stripe_account_id')
      .eq('user_id', job.claimed_by)
      .single();

    // Loyalty volume discount (Tier-0): a proven contractor↔sub pair earns a
    // lower sub-side platform fee as they complete more jobs together. The rate
    // is authoritative server-side (pair_fee_rate); base is 10%, floor is 5%.
    const { data: subFeeRate } = await supabase.rpc('pair_fee_rate', {
      p_contractor: job.contractor_id,
      p_sub: job.claimed_by,
    });
    const subFeePct = typeof subFeeRate === 'number' ? subFeeRate : 0.10;

    // Platform fee: 5% from contractor side, discounted sub-side fee from payout.
    const platformFeeContractor = Math.round(job.sub_payout * 0.05 * 100);
    const subFeeAmount = job.sub_payout * subFeePct;
    const totalCharge = Math.round(job.sub_payout * 1.05 * 100); // payout + 5% contractor fee

    let customerId = job.contractor?.stripe_customer_id;
    if (!customerId) {
      const { data: { email } } = await supabase.auth.admin.getUserById(user.id);
      const customer = await stripe.customers.create({ email: email ?? undefined });
      customerId = customer.id;
      await supabase
        .from('contractor_profiles')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', user.id);
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCharge,
      currency: 'usd',
      customer: customerId,
      metadata: { jobId, subId: job.claimed_by, subPayout: job.sub_payout.toString() },
      ...(sub?.stripe_account_id ? {
        transfer_data: {
          destination: sub.stripe_account_id,
          amount: Math.round(job.sub_payout * (1 - subFeePct) * 100), // sub gets payout minus loyalty-discounted fee
        },
      } : {}),
    });

    // Create payment record
    await supabase.from('payment_records').upsert({
      job_id: jobId,
      contractor_id: user.id,
      sub_id: job.claimed_by,
      install_price: job.install_price,
      sub_payout: job.sub_payout,
      platform_fee_contractor: platformFeeContractor / 100,
      platform_fee_sub: subFeeAmount,
      stripe_payment_intent_id: paymentIntent.id,
      stripe_sub_account_id: sub?.stripe_account_id ?? null,
      status: 'processing',
    }, { onConflict: 'job_id' });

    return new Response(
      JSON.stringify({ clientSecret: paymentIntent.client_secret }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
