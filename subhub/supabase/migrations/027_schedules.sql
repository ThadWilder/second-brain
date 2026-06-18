-- 027_schedules.sql
-- Periodic maintenance jobs for the trust/crew mechanics. These keep derived
-- state fresh without an external scheduler:
--   • recompute_diversification() — refresh every sub's Diversification Score
--   • maintain_crew_status()      — flag stale crew pairs (migration 020)
--
-- Scheduling uses pg_cron when available (Supabase: enable under Database →
-- Extensions, or this migration enables it). If pg_cron isn't present the
-- functions still exist and can be invoked manually or from an edge cron.

-- Refresh the Diversification Score for every sub with recent completed work.
create or replace function recompute_diversification() returns int
language plpgsql security definer set search_path = public as $$
declare v_count int := 0; r record;
begin
  for r in
    select distinct claimed_by as sub_id
    from jobs
    where claimed_by is not null and status = 'complete'
      and completed_at >= now() - interval '6 months'
  loop
    update sub_profiles
       set diversification_score = diversification_score(r.sub_id)
     where user_id = r.sub_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Schedule both jobs daily if pg_cron is installed. Wrapped so a missing
-- extension doesn't fail the whole migration.
do $$
begin
  create extension if not exists pg_cron;

  -- Reschedule idempotently (unschedule prior definitions by name if present).
  perform cron.unschedule(jobid)
    from cron.job where jobname in ('crew-maintenance', 'diversification-refresh');

  perform cron.schedule('crew-maintenance', '0 8 * * *',  $cmd$ select maintain_crew_status(); $cmd$);
  perform cron.schedule('diversification-refresh', '30 8 * * *', $cmd$ select recompute_diversification(); $cmd$);
exception when others then
  raise notice 'pg_cron not available (%) — schedule maintain_crew_status() and recompute_diversification() externally.', sqlerrm;
end;
$$;
