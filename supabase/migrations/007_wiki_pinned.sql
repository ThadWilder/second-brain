-- Wiki pinned sections — human-written content preserved across Claude rewrites
ALTER TABLE wiki_pages ADD COLUMN IF NOT EXISTS pinned_sections JSONB DEFAULT '[]'::jsonb;
