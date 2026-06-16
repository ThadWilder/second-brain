// Cancels the $1,000 authorization hold on a job — called when a job is cancelled or expired.
// The hold is automatically voided when a full payment is later captured for the same job.
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

    const { data: job } = await supabase
      .from('jobs')
      .select('hold_payment_intent_id, contractor_id')
      .eq('id', jobId)
      .single();

    if (!job) throw new Error('Job not found');
    if (job.contractor_id !== user.id) throw new Error('Unauthorized');
    if (!job.hold_payment_intent_id) {
      return new Response(JSON.stringify({ status: 'no_hold' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cancelled = await stripe.paymentIntents.cancel(job.hold_payment_intent_id);

    await supabase
      .from('jobs')
      .update({ hold_payment_intent_id: null })
      .eq('id', jobId);

    return new Response(
      JSON.stringify({ status: cancelled.status }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
