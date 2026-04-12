ALTER TABLE saved_links ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
