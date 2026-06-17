// Recomputes a subcontractor's reputation: Job Success Score, tier,
// response rate, total earned. Call with { subUserId } after a job completes,
// a rating lands, or a dispute resolves. Mirrors lib/reputation.ts.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function deriveTier(score: number | null, jobsCompleted: number): string {
  if (jobsCompleted === 0 || score === null) return 'new';
  if (score >= 90 && jobsCompleted >= 20) return 'elite';
  if (score >= 80 && jobsCompleted >= 10) return 'top_rated';
  return 'rising';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { subUserId } = await req.json();
    if (!subUserId) throw new Error('subUserId required');

    // Profile
    const { data: profile } = await supabase
      .from('sub_profiles')
      .select('id, rating, rating_count')
      .eq('user_id', subUserId)
      .single();
    if (!profile) throw new Error('Sub profile not found');

    // Completed jobs claimed by this sub
    const { data: completedJobs } = await supabase
      .from('jobs')
      .select('id, sub_payout, status')
      .eq('claimed_by', subUserId)
      .eq('status', 'complete');
    const jobsCompleted = completedJobs?.length ?? 0;
    const totalEarned = (completedJobs ?? []).reduce((s, j) => s + Number(j.sub_payout ?? 0), 0);

    // Ratings received → rehire rate
    const { data: ratings } = await supabase
      .from('ratings')
      .select('stars, rehire')
      .eq('ratee_id', subUserId);
    const rehireCount = (ratings ?? []).filter(r => r.rehire).length;
    const rehireRate = (ratings?.length ?? 0) > 0 ? rehireCount / ratings!.length : 0;

    // Disputes opened against jobs this sub did
    const jobIds = (completedJobs ?? []).map(j => j.id);
    let disputeCount = 0;
    if (jobIds.length) {
      const { count } = await supabase
        .from('disputes')
        .select('*', { count: 'exact', head: true })
        .in('job_id', jobIds);
      disputeCount = count ?? 0;
    }

    // Response rate from messages: contractor-initiated threads the sub replied to,
    // and average first-reply latency in minutes.
    const { data: msgs } = await supabase
      .from('messages')
      .select('job_id, sender_role, created_at')
      .eq('sender_role', 'subcontractor')
      .limit(1000);
    const repliedJobs = new Set((msgs ?? []).map(m => m.job_id));
    const { data: contractorThreads } = await supabase
      .from('messages')
      .select('job_id')
      .eq('sender_role', 'contractor')
      .limit(1000);
    const initiated = new Set((contractorThreads ?? []).map(m => m.job_id));
    let responded = 0;
    initiated.forEach(jid => { if (repliedJobs.has(jid)) responded++; });
    const responseRate = initiated.size > 0 ? Math.round((responded / initiated.size) * 100) : null;

    // Composite score (≥3 completed jobs)
    let score: number | null = null;
    if (jobsCompleted >= 3) {
      const ratingComponent = (Number(profile.rating ?? 0) / 5) * 100 * 0.5;
      const rehireComponent = rehireRate * 100 * 0.2;
      const disputeFree = Math.max(0, 1 - disputeCount / jobsCompleted);
      const disputeComponent = disputeFree * 100 * 0.2;
      const responseComponent = (responseRate ?? 80) * 0.1;
      score = Math.round(ratingComponent + rehireComponent + disputeComponent + responseComponent);
    }

    const tier = deriveTier(score, jobsCompleted);

    await supabase
      .from('sub_profiles')
      .update({
        job_success_score: score,
        tier,
        response_rate: responseRate,
        jobs_completed: jobsCompleted,
        total_earned: totalEarned,
      })
      .eq('id', profile.id);

    return new Response(
      JSON.stringify({ score, tier, responseRate, jobsCompleted, totalEarned }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
