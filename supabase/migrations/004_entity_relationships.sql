-- Entity relationships — person works_for brand, person manages brand, etc.
CREATE TABLE IF NOT EXISTS entity_relationships (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          uuid NOT NULL,
  from_entity_id  uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  to_entity_id    uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relationship    text NOT NULL,  -- 'works_for', 'manages', 'rep_for', 'contracted_by', 'supplies'
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS entity_relationships_unique ON entity_relationships(from_entity_id, to_entity_id, relationship);
CREATE INDEX IF NOT EXISTS entity_relationships_from ON entity_relationships(from_entity_id);
CREATE INDEX IF NOT EXISTS entity_relationships_to ON entity_relationships(to_entity_id);
