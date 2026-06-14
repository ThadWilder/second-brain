import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.0.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' });
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

serve(async (req) => {
  // Stripe webhooks are POST only and must not have CORS preflight
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', (err as Error).message);
    return new Response(`Webhook signature error: ${(err as Error).message}`, { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object as Stripe.PaymentIntent;

        // Transition payment record: processing → held
        // "held" means the card has been charged and the payout is ready to release
        const { error } = await supabase
          .from('payment_records')
          .update({ status: 'held', charged_at: new Date().toISOString() })
          .eq('stripe_payment_intent_id', intent.id)
          .eq('status', 'processing'); // guard: only update if still processing

        if (error) {
          console.error('Failed to update payment_record to held:', error.message);
        } else {
          console.log(`payment_intent.succeeded: ${intent.id} → held`);
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const intent = event.data.object as Stripe.PaymentIntent;
        const failureMessage = intent.last_payment_error?.message ?? 'Card declined';

        await supabase
          .from('payment_records')
          .update({ status: 'failed', failure_reason: failureMessage })
          .eq('stripe_payment_intent_id', intent.id);

        // Notify contractor their payment failed
        const { data: record } = await supabase
          .from('payment_records')
          .select('contractor_id, job_id')
          .eq('stripe_payment_intent_id', intent.id)
          .single();

        if (record) {
          const { data: tokens } = await supabase
            .from('push_tokens')
            .select('token')
            .eq('user_id', record.contractor_id);

          if (tokens?.length) {
            await fetch('https://exp.host/--/api/v2/push/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(tokens.map(({ token }) => ({
                to: token,
                sound: 'default',
                title: 'Payment Failed',
                body: `${failureMessage}. Please update your payment method.`,
                data: { type: 'payment_failed', jobId: record.job_id },
              }))),
            });
          }
        }
        console.log(`payment_intent.payment_failed: ${intent.id}`);
        break;
      }

      case 'account.updated': {
        // Sub Connect account status changed — update verified flag
        const account = event.data.object as Stripe.Account;
        if (account.charges_enabled) {
          await supabase
            .from('sub_profiles')
            .update({ verified: true })
            .eq('stripe_account_id', account.id);
          console.log(`account.updated: ${account.id} → verified`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error('Error handling webhook event:', (err as Error).message);
    // Return 200 so Stripe doesn't retry — log the error but don't block
    return new Response(JSON.stringify({ received: true, error: (err as Error).message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
