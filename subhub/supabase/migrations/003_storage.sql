-- Supabase Storage bucket for job media.
-- Run in the SQL editor after creating the bucket in the Storage dashboard,
-- or use the Storage API to create the bucket first.

-- Create bucket (idempotent)
insert into storage.buckets (id, name, public)
values ('job-media', 'job-media', false)
on conflict (id) do nothing;

-- Job parties can upload and read their own job's media
create policy "job_media_upload" on storage.objects
  for insert with check (
    bucket_id = 'job-media'
    and auth.uid() is not null
  );

create policy "job_media_read" on storage.objects
  for select using (
    bucket_id = 'job-media'
    and auth.uid() is not null
  );

create policy "job_media_delete_own" on storage.objects
  for delete using (
    bucket_id = 'job-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
