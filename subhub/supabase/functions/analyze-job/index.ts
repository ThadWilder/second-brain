// AI job quality analyzer for subs. Scores $/day efficiency, material friction,
// and industry complexity, then returns a score + plain-English explanation.
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
      .select('*, contractor:contractor_profiles(delay_pay_rate_per_hour, addon_pay_rate_per_lf, return_trip_fee, change_order_fee, payment_terms_days)')
      .eq('id', jobId)
      .single();

    if (!job) throw new Error('Job not found');

    const payPerDay = job.sub_payout / job.estimated_days;
    const contractor = job.contractor as any;

    const prompt = `You are a SubHub job quality analyzer helping a subcontractor decide if a job is worth taking.

Job details:
- Title: ${job.title}
- Industry: ${job.industry}
- Sub payout: $${job.sub_payout}
- Estimated days: ${job.estimated_days} (= $${Math.round(payPerDay)}/day)
- Material status: ${job.material_status} (on_site = easiest, local = minor pickup, distant = delivery friction)
- City/State: ${job.city}, ${job.state}
- Scope: ${job.scope_of_work?.slice(0, 200)}
- Contractor fee schedule: $${contractor?.delay_pay_rate_per_hour ?? 35}/hr delay pay, $${contractor?.addon_pay_rate_per_lf ?? 15}/LF add-on, $${contractor?.return_trip_fee ?? 150} return trip, payment terms ${contractor?.payment_terms_days ?? 14} days

Industry pay benchmarks ($/LF):
- Fencing: $8–$18/LF, Decking: $12–$22/SF, Pergola/Shade: $15–$35/LF, Gates: $250–$700/unit, Retaining Walls: $20–$50/LF

Analyze this job and respond with ONLY a valid JSON object (no markdown, no explanation outside the JSON):
{
  "score": "great" | "fair" | "low",
  "headline": "10 words max — punchy one-liner",
  "bullets": ["bullet 1", "bullet 2", "bullet 3"],
  "watch_out": "one risk or caution, or null if none"
}

Score criteria: great = strong pay + easy materials + fair terms; fair = average on most factors; low = below market pay or significant friction.`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!claudeRes.ok) throw new Error(`Claude API error: ${await claudeRes.text()}`);

    const claudeData = await claudeRes.json();
    const raw = claudeData.content?.[0]?.text ?? '{}';

    let analysis;
    try {
      analysis = JSON.parse(raw);
    } catch {
      analysis = { score: 'fair', headline: 'Analysis unavailable', bullets: [], watch_out: null };
    }

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
