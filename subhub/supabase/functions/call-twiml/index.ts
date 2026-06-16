// Returns TwiML that dials the callee once the caller picks up.
// Called by Twilio when the outbound call to the caller is answered.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  const url = new URL(req.url);
  const to = url.searchParams.get('to');

  if (!to) {
    return new Response('<Response><Say>Configuration error. Please try again.</Say></Response>', {
      status: 400,
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Please hold while we connect you to your SubHub contact.</Say>
  <Dial callerId="${Deno.env.get('TWILIO_PHONE_NUMBER') ?? 'SubHub'}">${to}</Dial>
</Response>`;

  return new Response(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  });
});
