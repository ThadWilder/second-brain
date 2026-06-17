// When a job is posted, find subs whose saved searches match and push them an
// alert. Called from post-job after the listing goes live. Best-effort:
// matching is coarse (skill + ZIP prefix + min payout) and never blocks posting.
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

    const { jobId } = await req.json();
    if (!jobId) throw new Error('jobId required');

    const { data: job } = await supabase
      .from('jobs')
      .select('id, title, industry, zip, sub_payout, status')
      .eq('id', jobId)
      .single();
    if (!job || job.status !== 'posted') {
      return new Response(JSON.stringify({ matched: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: searches } = await supabase
      .from('saved_searches')
      .select('id, sub_id, skills, zip, min_payout, notify')
      .eq('notify', true);

    const matchedSubIds: string[] = [];
    for (const s of searches ?? []) {
      const skillOk = !s.skills?.length || s.skills.includes(job.industry);
      const zipOk = !s.zip || (job.zip && job.zip.slice(0, 3) === String(s.zip).slice(0, 3));
      const payOk = !s.min_payout || Number(job.sub_payout) >= Number(s.min_payout);
      if (skillOk && zipOk && payOk) matchedSubIds.push(s.sub_id);
    }

    if (matchedSubIds.length === 0) {
      return new Response(JSON.stringify({ matched: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve sub user_ids → push tokens
    const { data: subs } = await supabase
      .from('sub_profiles')
      .select('user_id')
      .in('id', matchedSubIds);
    const userIds = [...new Set((subs ?? []).map(s => s.user_id))];

    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .in('user_id', userIds);

    if (tokens?.length) {
      const messages = tokens.map(({ token }) => ({
        to: token,
        sound: 'default',
        title: '🔔 New job matches your alert',
        body: `${job.title} — $${Number(job.sub_payout).toLocaleString()}`,
        data: { type: 'saved_search_match', jobId: job.id },
      }));
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      });
    }

    return new Response(JSON.stringify({ matched: userIds.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
