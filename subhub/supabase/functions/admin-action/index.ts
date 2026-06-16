// Service-role edge function for admin actions that bypass RLS.
// All calls validated against user_metadata.role = 'admin'.
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

    // Verify the caller is an admin
    const authHeader = req.headers.get('Authorization');
    const { data: { user } } = await supabase.auth.getUser(authHeader?.split(' ')[1]);
    if (!user) throw new Error('Unauthorized');
    if (user.user_metadata?.role !== 'admin') throw new Error('Admin access required');

    const { action, jobId, subId, verified } = await req.json();

    if (action === 'cancel_job') {
      if (!jobId) throw new Error('jobId required');
      await supabase.from('jobs').update({ status: 'draft', claimed_by: null, claimed_at: null }).eq('id', jobId);
      return ok({ success: true });
    }

    if (action === 'resolve_dispute') {
      if (!jobId) throw new Error('jobId required');
      // Admin closes dispute — marks as complete without payment (manual resolution)
      await supabase.from('jobs').update({ status: 'complete', completed_at: new Date().toISOString() }).eq('id', jobId);
      return ok({ success: true });
    }

    if (action === 'toggle_verified') {
      if (!subId) throw new Error('subId required');
      await supabase.from('sub_profiles').update({ verified: !!verified }).eq('user_id', subId);
      return ok({ success: true });
    }

    if (action === 'get_stats') {
      const [
        { count: totalJobs },
        { count: activeJobs },
        { count: disputes },
        { count: totalContractors },
        { count: totalSubs },
        { data: revenue },
        { data: pending },
      ] = await Promise.all([
        supabase.from('jobs').select('*', { count: 'exact', head: true }),
        supabase.from('jobs').select('*', { count: 'exact', head: true }).in('status', ['claimed', 'in_progress']),
        supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'disputed'),
        supabase.from('contractor_profiles').select('*', { count: 'exact', head: true }),
        supabase.from('sub_profiles').select('*', { count: 'exact', head: true }),
        supabase.from('payment_records').select('sub_payout, platform_fee_contractor, platform_fee_sub').eq('status', 'released'),
        supabase.from('payment_records').select('sub_payout').eq('status', 'held'),
      ]);

      const totalRevenue = (revenue ?? []).reduce((s: number, r: any) =>
        s + (r.platform_fee_contractor ?? 0) + (r.platform_fee_sub ?? 0), 0);
      const pendingPayout = (pending ?? []).reduce((s: number, r: any) => s + (r.sub_payout ?? 0), 0);

      return ok({ totalJobs, activeJobs, disputes, totalContractors, totalSubs, totalRevenue, pendingPayout });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function ok(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
  });
}
