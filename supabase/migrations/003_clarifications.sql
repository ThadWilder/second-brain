-- Second Brain — Clarifications
-- Run after 002_wiki.sql
-- When Claude encounters an unknown person or ambiguous entity,
-- it creates a clarification request. The dashboard surfaces these
-- so Brandy can fill in the details.

CREATE TABLE IF NOT EXISTS pending_clarifications (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          uuid NOT NULL,
  entity_id       uuid REFERENCES entities(id) ON DELETE CASCADE,
  entry_id        uuid REFERENCES entries(id) ON DELETE SET NULL,
  question        text NOT NULL,           -- "Who is Sarah? (mentioned in MaidPro email)"
  context         text,                    -- raw snippet where the name appeared
  field           text NOT NULL,           -- what we need: 'category', 'role', 'company', 'type'
  suggestions     jsonb,                   -- Claude's best guesses: ["client_contact", "brand_rep"]
  resolved        boolean NOT NULL DEFAULT false,
  resolution      text,                    -- the answer once provided
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);

CREATE INDEX pending_clarifications_org ON pending_clarifications(org_id, resolved, created_at DESC);
CREATE INDEX pending_clarifications_entity ON pending_clarifications(entity_id);

-- Remove Jack from seed data (not on team)
DELETE FROM entities
WHERE org_id = '00000000-0000-0000-0000-000000000001'
  AND normalized_name = 'jack'
  AND type = 'contact';
