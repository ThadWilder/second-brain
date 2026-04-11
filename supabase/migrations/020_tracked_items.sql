CREATE TABLE IF NOT EXISTS tracked_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused')),
  owner text,
  brand_entity_id uuid REFERENCES entities(id) ON DELETE SET NULL,
  follow_up_date date,
  data_source text,
  data_source_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tracked_items_org ON tracked_items (org_id, status, created_at DESC);
