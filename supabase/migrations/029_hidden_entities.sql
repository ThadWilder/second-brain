-- 029: Hidden entity associations on saved_links
ALTER TABLE saved_links ADD COLUMN IF NOT EXISTS hidden_entity_ids text[] DEFAULT '{}';
