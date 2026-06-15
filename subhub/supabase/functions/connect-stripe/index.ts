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

    const { returnUrl } = await req.json();

    // Look up existing sub profile
    const { data: subProfile } = await supabase
      .from('sub_profiles')
      .select('stripe_account_id, name')
      .eq('user_id', user.id)
      .single();

    let accountId = subProfile?.stripe_account_id;

    // Create Connect Express account if needed
    if (!accountId) {
      const { data: { email } } = await supabase.auth.admin.getUserById(user.id);
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: email ?? undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'individual',
        metadata: { subhub_user_id: user.id, name: subProfile?.name ?? '' },
      });
      accountId = account.id;

      await supabase
        .from('sub_profiles')
        .update({ stripe_account_id: accountId })
        .eq('user_id', user.id);
    }

    // Create onboarding link
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: returnUrl,
      return_url: `${returnUrl}?stripe_connected=1`,
      type: 'account_onboarding',
    });

    return new Response(
      JSON.stringify({ url: link.url, accountId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
