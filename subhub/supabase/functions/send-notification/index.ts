// Generic notification dispatcher — called by other Edge Functions or DB triggers.
// Accepts { userId, title, body, data } and fans out to all user's push tokens.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    const { userId, title, body, data } = await req.json();

    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', userId);

    if (!tokens?.length) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: corsHeaders });
    }

    const messages = tokens.map(({ token }: { token: string }) => ({
      to: token,
      sound: 'default',
      title,
      body,
      data: data ?? {},
    }));

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });

    // Log notification
    await supabase.from('notification_log').insert({
      user_id: userId,
      type: data?.type ?? 'generic',
      job_id: data?.jobId ?? null,
    });

    return new Response(
      JSON.stringify({ sent: tokens.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
