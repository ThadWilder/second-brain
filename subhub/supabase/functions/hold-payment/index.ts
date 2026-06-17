// Places a $1,000 authorization hold on the contractor's saved card when a job is posted.
// Uses capture_method: 'manual' so the hold never charges unless explicitly captured.
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
    if (!jobId) throw new Error('jobId required');

    const { data: profile } = await supabase
      .from('contractor_profiles')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    if (!profile?.stripe_customer_id) throw new Error('No payment method on file. Add a card in your profile before posting.');

    // Retrieve customer to find their default saved payment method
    const customer = await stripe.customers.retrieve(profile.stripe_customer_id, {
      expand: ['invoice_settings.default_payment_method'],
    }) as any;

    const defaultPm = customer.invoice_settings?.default_payment_method;
    let paymentMethodId = typeof defaultPm === 'string' ? defaultPm : defaultPm?.id;

    // SetupIntent flows attach a card but don't mark it as the customer's
    // default. Fall back to the most recently attached card, then persist it
    // as the default so future holds + charges find it immediately.
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

    if (!paymentMethodId) throw new Error('No card on file. Add a payment method in your profile before posting.');

    const hold = await stripe.paymentIntents.create({
      amount: 100000, // $1,000.00
      currency: 'usd',
      customer: profile.stripe_customer_id,
      payment_method: paymentMethodId,
      capture_method: 'manual',
      confirm: true,
      off_session: true,
      description: `SubHub posting hold — job ${jobId}`,
      metadata: { jobId, type: 'posting_hold', contractorId: user.id },
    });

    await supabase
      .from('jobs')
      .update({ hold_payment_intent_id: hold.id })
      .eq('id', jobId)
      .eq('contractor_id', user.id);

    return new Response(
      JSON.stringify({ holdId: hold.id, status: hold.status }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
