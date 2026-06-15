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

    const { data: payment } = await supabase
      .from('payment_records')
      .select('*')
      .eq('job_id', jobId)
      .single();

    if (!payment) throw new Error('No payment record found');
    if (payment.contractor_id !== user.id) throw new Error('Not your job');
    if (payment.status !== 'held') throw new Error('Payment not in held state');

    // Transfer net payout to sub's Connect account
    const netPayout = Math.round((payment.sub_payout - payment.platform_fee_sub) * 100);

    const transfer = await stripe.transfers.create({
      amount: netPayout,
      currency: 'usd',
      destination: payment.stripe_sub_account_id,
      metadata: { jobId },
    });

    await supabase
      .from('payment_records')
      .update({
        stripe_transfer_id: transfer.id,
        status: 'released',
        paid_out_at: new Date().toISOString(),
      })
      .eq('job_id', jobId);

    // Mark job complete
    await supabase
      .from('jobs')
      .update({ status: 'complete', completed_at: new Date().toISOString() })
      .eq('id', jobId);

    // Notify sub
    const { data: subTokens } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', payment.sub_id);

    if (subTokens?.length) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subTokens.map(({ token }) => ({
          to: token,
          sound: 'default',
          title: 'Payment Released',
          body: `$${(netPayout / 100).toLocaleString()} has been sent to your account.`,
          data: { type: 'payment_released', jobId },
        }))),
      });
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
