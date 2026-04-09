-- Second Brain — Wiki Layer
-- Run after 001_initial_schema.sql

-- ─────────────────────────────────────────
-- wiki_pages — one synthesized page per entity (or global topics)
--
-- The LLM owns this table entirely. It creates pages and rewrites
-- content on every ingest that touches the entity.
-- Humans read; LLM writes.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wiki_pages (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          uuid NOT NULL,
  entity_id       uuid REFERENCES entities(id) ON DELETE CASCADE,
  slug            text NOT NULL,           -- e.g. 'maidpro', 'miracle-method', 'seo-strategy'
  title           text NOT NULL,           -- display name
  content         text NOT NULL DEFAULT '', -- full markdown body, LLM-maintained
  summary         text NOT NULL DEFAULT '', -- one-paragraph synopsis, always kept current
  source_count    int NOT NULL DEFAULT 0,  -- how many entries have touched this page
  last_updated_by_entry uuid REFERENCES entries(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX wiki_pages_org_slug ON wiki_pages(org_id, slug);
CREATE INDEX wiki_pages_entity ON wiki_pages(entity_id);
CREATE INDEX wiki_pages_updated ON wiki_pages(org_id, updated_at DESC);

-- Auto-update updated_at
CREATE TRIGGER wiki_pages_updated_at_trigger
  BEFORE UPDATE ON wiki_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────
-- wiki_links — cross-references between pages
-- Maintained by the LLM during ingest.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wiki_links (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_page_id uuid NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  to_page_id   uuid NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  context      text,       -- one sentence: why these pages are linked
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX wiki_links_unique ON wiki_links(from_page_id, to_page_id);
CREATE INDEX wiki_links_from ON wiki_links(from_page_id);
CREATE INDEX wiki_links_to ON wiki_links(to_page_id);

-- ─────────────────────────────────────────
-- wiki_log — append-only audit trail (mirrors Karpathy's log.md)
-- Format: event_type | entity_name | entry_id | note
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wiki_log (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       uuid NOT NULL,
  event_type   text NOT NULL CHECK (event_type IN ('ingest', 'query', 'lint', 'manual_edit')),
  page_id      uuid REFERENCES wiki_pages(id) ON DELETE SET NULL,
  entry_id     uuid REFERENCES entries(id) ON DELETE SET NULL,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX wiki_log_org ON wiki_log(org_id, created_at DESC);
CREATE INDEX wiki_log_page ON wiki_log(page_id);

-- ─────────────────────────────────────────
-- Seed wiki pages for existing brand entities
-- Pages start empty — content is written by the LLM on first ingest.
-- ─────────────────────────────────────────
DO $$
DECLARE
  org uuid := '00000000-0000-0000-0000-000000000001';
  e   RECORD;
BEGIN
  FOR e IN
    SELECT id, name, normalized_name
    FROM entities
    WHERE org_id = org AND type = 'brand'
  LOOP
    INSERT INTO wiki_pages (org_id, entity_id, slug, title, content, summary)
    VALUES (
      org,
      e.id,
      replace(e.normalized_name, ' ', '-'),
      e.name,
      '',
      ''
    )
    ON CONFLICT (org_id, slug) DO NOTHING;
  END LOOP;
END $$;
