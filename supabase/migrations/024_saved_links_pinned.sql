ALTER TABLE saved_links ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
