CREATE TABLE IF NOT EXISTS saved_links (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL,
  url text NOT NULL,
  label text,
  category text,
  brand_entity_id uuid REFERENCES entities(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX saved_links_url ON saved_links (org_id, url);
