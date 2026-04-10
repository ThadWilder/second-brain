-- Wiki queue — decouples wiki page updates from the ingest pipeline.
-- Items are queued during ingest and processed asynchronously by /api/wiki/process.

CREATE TABLE IF NOT EXISTS wiki_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  entry_id UUID NOT NULL REFERENCES entries(id),
  entity_id UUID NOT NULL REFERENCES entities(id),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_wiki_queue_pending ON wiki_queue (status) WHERE status = 'pending';
