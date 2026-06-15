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

    // Load contractor profile — check for existing Stripe customer
    const { data: profile } = await supabase
      .from('contractor_profiles')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    if (!profile) throw new Error('Contractor profile not found. Complete onboarding first.');

    let customerId = profile.stripe_customer_id;

    // Create Stripe Customer if this is their first time
    if (!customerId) {
      const { data: { user: authUser } } = await supabase.auth.admin.getUserById(user.id);
      const customer = await stripe.customers.create({
        email: authUser?.email ?? undefined,
        metadata: { subhub_user_id: user.id },
      });
      customerId = customer.id;

      await supabase
        .from('contractor_profiles')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', user.id);
    }

    // SetupIntent — saves payment method without charging immediately
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session', // allows charging later when job is approved
      metadata: { subhub_user_id: user.id },
    });

    // EphemeralKey — gives Stripe PaymentSheet temporary access to customer's saved methods
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: '2023-10-16' }
    );

    return new Response(
      JSON.stringify({
        setupIntentClientSecret: setupIntent.client_secret,
        customerId,
        ephemeralKey: ephemeralKey.secret,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
