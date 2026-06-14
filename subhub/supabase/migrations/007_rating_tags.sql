-- Add tags array to ratings for category-based feedback
ALTER TABLE ratings
  ADD COLUMN IF NOT EXISTS tags text[] default '{}';
