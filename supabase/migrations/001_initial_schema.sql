-- Second Brain — Initial Schema
-- Run this against your Supabase project once.

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
-- pgvector is available on Supabase by default
-- CREATE EXTENSION IF NOT EXISTS "vector";

-- ─────────────────────────────────────────
-- entries — every raw dump
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entries (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id              uuid NOT NULL,
  raw_text            text NOT NULL,
  source              text NOT NULL CHECK (source IN ('email', 'chat', 'paste', 'meeting_notes')),
  source_meta         jsonb,
  source_dedupe_key   text NOT NULL,
  processing_status   text NOT NULL DEFAULT 'pending'
                        CHECK (processing_status IN ('pending', 'processing', 'done', 'failed')),
  processing_error    text,
  attempt_count       int NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  processed_at        timestamptz
);

CREATE UNIQUE INDEX entries_dedupe ON entries(source_dedupe_key);
CREATE INDEX entries_org_status ON entries(org_id, processing_status);

-- ─────────────────────────────────────────
-- entities — self-growing: brands, vendors, contacts, topics
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entities (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id           uuid NOT NULL,
  type             text NOT NULL,   -- 'brand', 'vendor', 'contact', 'topic', or any new type
  name             text NOT NULL,
  normalized_name  text NOT NULL,   -- lowercased, trimmed, whitespace-collapsed
  metadata         jsonb,           -- role, company, cost, notes — varies by type
  first_seen       timestamptz NOT NULL DEFAULT now(),
  last_seen        timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX entities_org_normalized ON entities(org_id, type, normalized_name);
CREATE INDEX entities_org_type ON entities(org_id, type);
CREATE INDEX entities_name_trgm ON entities USING gin (name gin_trgm_ops);
CREATE INDEX entities_normalized ON entities(org_id, normalized_name);

-- ─────────────────────────────────────────
-- entity_aliases — alternate names → canonical entity
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entity_aliases (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id         uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  alias             text NOT NULL,
  normalized_alias  text NOT NULL,  -- lowercased, trimmed
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX entity_aliases_unique ON entity_aliases(normalized_alias, entity_id);
CREATE INDEX entity_aliases_normalized ON entity_aliases(normalized_alias);

-- ─────────────────────────────────────────
-- entry_entities — many-to-many
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entry_entities (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_id     uuid NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  entity_id    uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relationship text NOT NULL CHECK (relationship IN ('about', 'assigned_to', 'waiting_on', 'decided_by'))
);

CREATE UNIQUE INDEX entry_entities_unique ON entry_entities(entry_id, entity_id, relationship);
CREATE INDEX entry_entities_entry ON entry_entities(entry_id);
CREATE INDEX entry_entities_entity ON entry_entities(entity_id);

-- ─────────────────────────────────────────
-- tasks — extracted action items
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id                uuid NOT NULL,
  entry_id              uuid REFERENCES entries(id) ON DELETE SET NULL,
  description           text NOT NULL,
  status                text NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'done', 'blocked')),
  escalation            boolean NOT NULL DEFAULT false,
  due_date              date,
  waiting_on            text,
  waiting_on_entity_id  uuid REFERENCES entities(id) ON DELETE SET NULL,
  resolved_at           timestamptz,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tasks_org_status ON tasks(org_id, status);
CREATE INDEX tasks_due_date ON tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX tasks_escalation ON tasks(org_id, escalation) WHERE escalation = true;
CREATE INDEX tasks_updated_at ON tasks(updated_at);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_updated_at_trigger
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────
-- task_events — activity log (source of truth for lifecycle)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_events (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  entry_id    uuid REFERENCES entries(id) ON DELETE SET NULL,
  event_type  text NOT NULL CHECK (event_type IN (
                'created', 'status_change', 'escalated', 'de_escalated',
                'due_date_changed', 'note_added', 'nudged'
              )),
  metadata    jsonb,  -- e.g. {from: "open", to: "done"}
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX task_events_task ON task_events(task_id);
CREATE INDEX task_events_type ON task_events(task_id, event_type);

-- ─────────────────────────────────────────
-- task_entities — link tasks to entities
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_entities (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id    uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  entity_id  uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('brand', 'assigned_to', 'vendor', 'topic'))
);

CREATE UNIQUE INDEX task_entities_unique ON task_entities(task_id, entity_id, role);
CREATE INDEX task_entities_task ON task_entities(task_id);
CREATE INDEX task_entities_entity ON task_entities(entity_id);

-- ─────────────────────────────────────────
-- decisions — extracted decisions
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS decisions (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      uuid NOT NULL,
  entry_id    uuid REFERENCES entries(id) ON DELETE SET NULL,
  summary     text NOT NULL,
  made_by     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX decisions_org ON decisions(org_id, created_at DESC);

-- ─────────────────────────────────────────
-- decision_entities — link decisions to entities
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS decision_entities (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  decision_id  uuid NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  entity_id    uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  role         text NOT NULL
);

CREATE UNIQUE INDEX decision_entities_unique ON decision_entities(decision_id, entity_id, role);

-- ─────────────────────────────────────────
-- pending_responses — things needing a reply
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_responses (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      uuid NOT NULL,
  entry_id    uuid REFERENCES entries(id) ON DELETE SET NULL,
  summary     text NOT NULL,
  responded   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pending_responses_org ON pending_responses(org_id, responded, created_at DESC);

-- ─────────────────────────────────────────
-- pending_response_entities
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_response_entities (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pending_response_id  uuid NOT NULL REFERENCES pending_responses(id) ON DELETE CASCADE,
  entity_id            uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  role                 text NOT NULL CHECK (role IN ('brand', 'contact', 'vendor'))
);

CREATE UNIQUE INDEX pending_response_entities_unique ON pending_response_entities(pending_response_id, entity_id, role);

-- ─────────────────────────────────────────
-- nudge_messages — one row per nudge email sent
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nudge_messages (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id               uuid NOT NULL,
  channel              text NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'in_app')),
  postmark_message_id  text,
  sent_at              timestamptz NOT NULL DEFAULT now(),
  responded            boolean NOT NULL DEFAULT false,
  response_entry_id    uuid REFERENCES entries(id) ON DELETE SET NULL
);

CREATE INDEX nudge_messages_org ON nudge_messages(org_id, sent_at DESC);

-- ─────────────────────────────────────────
-- nudge_message_tasks — links nudge messages to the tasks they contain
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nudge_message_tasks (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nudge_message_id  uuid NOT NULL REFERENCES nudge_messages(id) ON DELETE CASCADE,
  task_id           uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX nudge_message_tasks_unique ON nudge_message_tasks(nudge_message_id, task_id);

-- ─────────────────────────────────────────
-- conversations — chat sessions
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id                        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id                    uuid NOT NULL,
  managed_agent_session_id  text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  last_active_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX conversations_org ON conversations(org_id, last_active_at DESC);

-- ─────────────────────────────────────────
-- messages — local message persistence
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id  uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role             text NOT NULL CHECK (role IN ('user', 'assistant')),
  content          text NOT NULL,
  tool_calls       jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX messages_conversation ON messages(conversation_id, created_at ASC);

-- ─────────────────────────────────────────
-- Seed data
-- ─────────────────────────────────────────
DO $$
DECLARE
  org uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- Brands
  INSERT INTO entities (org_id, type, name, normalized_name, metadata) VALUES
    (org, 'brand', 'MaidPro',               'maidpro',               '{"color": "#22c55e"}'),
    (org, 'brand', 'USA Insulation',         'usa insulation',         '{"color": "#3b82f6"}'),
    (org, 'brand', 'Pestmaster',             'pestmaster',             '{"color": "#f59e0b"}'),
    (org, 'brand', 'Men In Kilts',           'men in kilts',           '{"color": "#8b5cf6"}'),
    (org, 'brand', 'Mold Medics',            'mold medics',            '{"color": "#06b6d4"}'),
    (org, 'brand', 'Miracle Method',         'miracle method',         '{"color": "#ec4899"}'),
    (org, 'brand', 'Granite Garage Floors',  'granite garage floors',  '{"color": "#f97316"}')
  ON CONFLICT (org_id, type, normalized_name) DO NOTHING;

  -- Team members
  INSERT INTO entities (org_id, type, name, normalized_name, metadata) VALUES
    (org, 'contact', 'Michelle', 'michelle', '{"role": "team"}'),
    (org, 'contact', 'Dustin',   'dustin',   '{"role": "team"}'),
    (org, 'contact', 'Jack',     'jack',     '{"role": "team"}'),
    (org, 'contact', 'Amanda',   'amanda',   '{"role": "team"}')
  ON CONFLICT (org_id, type, normalized_name) DO NOTHING;

  -- Known vendors
  INSERT INTO entities (org_id, type, name, normalized_name, metadata) VALUES
    (org, 'vendor', 'Moe',       'moe',       '{"notes": "SEO vendor — Moe SEO"}'),
    (org, 'vendor', 'Red Brick', 'red brick', '{"notes": "Legacy vendor"}')
  ON CONFLICT (org_id, type, normalized_name) DO NOTHING;

  -- Aliases for Moe
  INSERT INTO entity_aliases (entity_id, alias, normalized_alias)
  SELECT id, 'Moe SEO', 'moe seo' FROM entities WHERE org_id = org AND normalized_name = 'moe' AND type = 'vendor'
  ON CONFLICT DO NOTHING;
END $$;
