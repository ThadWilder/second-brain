-- 026_reviews_discovery.sql
-- The blueprint turns the rating system into a second discovery surface: a
-- scrollable Reviews page where subs browse feedback left for contractors,
-- filterable by trade. The existing RLS (`ratings_rater`) only lets a user
-- read ratings they wrote, which blocks discovery. Ratings are reputation
-- data and are intentionally public on the platform, so add a read policy.

drop policy if exists "ratings_public_read" on ratings;
create policy "ratings_public_read" on ratings
  for select using (true);

-- Reviews left for contractors, newest first, with trade + contractor info,
-- optionally filtered by trade. SECURITY DEFINER so the join is clean and the
-- shape is stable for the client.
create or replace function contractor_reviews(p_trade text default null, p_limit int default 50)
returns table(
  rating_id     uuid,
  contractor_id uuid,
  business_name text,
  rating        numeric,
  rating_count  int,
  trade         text,
  stars         int,
  comment       text,
  rehire        boolean,
  created_at    timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    r.id, cp.user_id, cp.business_name, cp.rating, cp.rating_count,
    j.industry, r.stars, r.comment, r.rehire, r.created_at
  from ratings r
  join jobs j               on j.id = r.job_id
  join contractor_profiles cp on cp.user_id = r.ratee_id
  where (p_trade is null or j.industry = p_trade)
    and r.comment is not null
  order by r.created_at desc
  limit p_limit;
$$;
