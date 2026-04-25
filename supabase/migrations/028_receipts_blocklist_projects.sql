-- 028: Receipts, blocklist, projects support

-- ── saved_links: add receipt columns ────────────────────────────
ALTER TABLE saved_links ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'link';
ALTER TABLE saved_links ADD COLUMN IF NOT EXISTS receipt_meta jsonb;
ALTER TABLE saved_links ADD COLUMN IF NOT EXISTS file_url text;
ALTER TABLE saved_links ADD COLUMN IF NOT EXISTS file_type text;
ALTER TABLE saved_links ADD COLUMN IF NOT EXISTS entry_id uuid REFERENCES entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_saved_links_type ON saved_links (org_id, type);

-- ── saved_links: enable RLS (pre-existing gap) ─────────────────
ALTER TABLE saved_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY saved_links_org_policy ON saved_links
  FOR ALL USING (org_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- ── blocklist table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blocklist (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL,
  pattern text NOT NULL,
  type text NOT NULL CHECK (type IN ('url', 'sender')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blocklist_org_lookup ON blocklist (org_id, type, pattern);

ALTER TABLE blocklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY blocklist_org_policy ON blocklist
  FOR ALL USING (org_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- ── task_entities: add 'project' role ───────────────────────────
ALTER TABLE task_entities DROP CONSTRAINT IF EXISTS task_entities_role_check;
ALTER TABLE task_entities ADD CONSTRAINT task_entities_role_check
  CHECK (role IN ('brand', 'assigned_to', 'vendor', 'topic', 'related', 'project'));
