-- Allow admin users to read all records across core tables
-- Admin role is stored in user_metadata.role = 'admin'

create policy "Admin read all jobs"
  on jobs for select
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

create policy "Admin read all contractor_profiles"
  on contractor_profiles for select
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

create policy "Admin read all sub_profiles"
  on sub_profiles for select
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

create policy "Admin read all payment_records"
  on payment_records for select
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

create policy "Admin read all change_orders"
  on change_orders for select
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

create policy "Admin read all ratings"
  on ratings for select
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
