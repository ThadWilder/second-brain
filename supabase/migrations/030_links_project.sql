-- 030: Link project association on saved_links
ALTER TABLE saved_links ADD COLUMN IF NOT EXISTS project_entity_id uuid REFERENCES entities(id) ON DELETE SET NULL;
