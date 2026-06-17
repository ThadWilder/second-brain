// Click-to-call bridge: Twilio calls both parties and bridges them.
// Neither the contractor nor the sub sees the other's real phone number.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Identify caller from JWT
    const { data: { user }, error: authErr } = await createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser();
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const { jobId } = await req.json();
    if (!jobId) return new Response(JSON.stringify({ error: 'jobId required' }), { status: 400, headers: corsHeaders });

    // Fetch job with contractor and sub profiles
    const { data: job } = await supabase
      .from('jobs')
      .select('contractor_id, claimed_by')
      .eq('id', jobId)
      .single();

    if (!job) return new Response(JSON.stringify({ error: 'Job not found' }), { status: 404, headers: corsHeaders });
    if (!job.claimed_by) return new Response(JSON.stringify({ error: 'Job not yet claimed' }), { status: 400, headers: corsHeaders });

    // Determine caller/callee based on who is making the request
    const isContractor = user.id === job.contractor_id;
    const callerUserId = user.id;
    const calleeUserId = isContractor ? job.claimed_by : job.contractor_id;

    // Fetch both phone numbers
    const [{ data: callerProfile }, { data: calleeProfile }] = await Promise.all([
      isContractor
        ? supabase.from('contractor_profiles').select('phone_number').eq('user_id', callerUserId).single()
        : supabase.from('sub_profiles').select('phone_number').eq('user_id', callerUserId).single(),
      isContractor
        ? supabase.from('sub_profiles').select('phone_number').eq('user_id', calleeUserId).single()
        : supabase.from('contractor_profiles').select('phone_number').eq('user_id', calleeUserId).single(),
    ]);

    const callerPhone = callerProfile?.phone_number;
    const calleePhone = calleeProfile?.phone_number;

    if (!callerPhone) return new Response(JSON.stringify({ error: 'Your phone number is not set. Update your profile to enable calling.' }), { status: 400, headers: corsHeaders });
    if (!calleePhone) return new Response(JSON.stringify({ error: 'The other party has not set a phone number.' }), { status: 400, headers: corsHeaders });

    // TwiML URL — bridges call to callee once caller picks up
    const twimlUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/call-twiml?to=${encodeURIComponent(calleePhone)}`;

    // Initiate Twilio call to caller
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!;
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')!;
    const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER')!;

    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: callerPhone,
          From: fromNumber,
          Url: twimlUrl,
        }).toString(),
      }
    );

    if (!twilioRes.ok) {
      const err = await twilioRes.text();
      return new Response(JSON.stringify({ error: `Twilio error: ${err}` }), { status: 500, headers: corsHeaders });
    }

    const twilioData = await twilioRes.json();

    // Log the call against the job — best effort
    await supabase.from('call_log').insert({
      job_id: jobId,
      initiated_by: user.id,
      initiated_by_role: isContractor ? 'contractor' : 'subcontractor',
      call_sid: twilioData.sid ?? null,
      status: 'initiated',
    }).then(() => {});

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
