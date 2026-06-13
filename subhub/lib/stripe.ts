import { supabase } from './supabase';

const SUPABASE_FUNCTIONS_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace('.supabase.co', '.supabase.co/functions/v1') ?? '';

async function callFunction(name: string, body: object) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Creates a Stripe Connect Express account + returns the onboarding URL.
// Sub taps this URL in a WebBrowser — Stripe handles KYC/bank setup.
export async function createConnectOnboardingUrl(returnUrl: string): Promise<string> {
  const { url } = await callFunction('connect-stripe', { returnUrl });
  return url;
}

// Creates a PaymentIntent for a completed job.
// Returns client_secret for confirming in the app.
export async function createPaymentIntent(jobId: string): Promise<string> {
  const { clientSecret } = await callFunction('create-payment-intent', { jobId });
  return clientSecret;
}

// Triggers payout to the sub after contractor confirms job completion.
export async function initiateSubPayout(jobId: string): Promise<void> {
  await callFunction('payout-sub', { jobId });
}

// Saves the Stripe sub account ID after successful Connect onboarding.
export async function saveSubStripeAccount(stripeAccountId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase
    .from('sub_profiles')
    .update({ stripe_account_id: stripeAccountId, payout_type: 'instant' })
    .eq('user_id', user!.id);
}

// Saves contractor's Stripe customer ID after payment method setup.
export async function saveContractorStripeCustomer(stripeCustomerId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase
    .from('contractor_profiles')
    .update({ stripe_customer_id: stripeCustomerId })
    .eq('user_id', user!.id);
}
