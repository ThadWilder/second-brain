CREATE TABLE IF NOT EXISTS nicejob_reviews (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL,
  brand_entity_id uuid REFERENCES entities(id) ON DELETE SET NULL,
  company_id text,
  company_name text NOT NULL,
  brand_name text NOT NULL,
  campaign_objective text,
  active_in_nicejob boolean DEFAULT false,
  api_status text,
  enrollments_all_time int,
  enrollments_monthly int,
  campaign_ready_since date,
  crm_id_confirmed boolean DEFAULT false,
  toggled_on_fms boolean DEFAULT false,
  has_anomaly boolean DEFAULT false,
  anomaly_reasons text[],
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX nicejob_reviews_upsert ON nicejob_reviews (org_id, company_name);
CREATE INDEX nicejob_reviews_brand ON nicejob_reviews (brand_entity_id);
CREATE INDEX nicejob_reviews_anomaly ON nicejob_reviews (org_id) WHERE has_anomaly = true;
