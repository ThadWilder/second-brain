-- Add attachments support to entries
-- Stores array of {url, type, filename} objects

ALTER TABLE entries ADD COLUMN attachments jsonb DEFAULT '[]'::jsonb;

-- Create storage bucket for file attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to attachments bucket
CREATE POLICY "Public read access on attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'attachments');

-- Allow authenticated uploads to attachments bucket
CREATE POLICY "Authenticated upload to attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'attachments');

-- Allow service role to manage attachments
CREATE POLICY "Service role manage attachments"
  ON storage.objects FOR ALL
  USING (bucket_id = 'attachments');
