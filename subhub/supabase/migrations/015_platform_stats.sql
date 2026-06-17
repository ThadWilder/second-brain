-- Aggregate platform stats visible to all authenticated users.
-- SECURITY DEFINER bypasses RLS so any logged-in user gets the real totals.
create or replace function public.get_platform_stats()
returns json
language sql
security definer
stable
as $$
  select json_build_object(
    'jobs_completed', (select count(*)::int  from jobs where status = 'complete'),
    'total_paid_out', (select coalesce(sum(sub_payout), 0)::numeric from jobs where status = 'complete')
  );
$$;
