-- Task consolidation suggestions
-- When the ingest pipeline detects a new task that overlaps with an existing
-- open task, it stores a suggestion here. The user can accept (merge) or dismiss.

CREATE TABLE IF NOT EXISTS consolidation_suggestions (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id              uuid NOT NULL,
  new_task_id         uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  existing_task_id    uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  merged_description  text NOT NULL,
  reason              text NOT NULL,
  status              text NOT NULL DEFAULT 'pending',  -- pending, accepted, dismissed
  created_at          timestamptz NOT NULL DEFAULT now(),
  resolved_at         timestamptz
);

CREATE INDEX consolidation_suggestions_org ON consolidation_suggestions(org_id, status, created_at DESC);
CREATE INDEX consolidation_suggestions_new_task ON consolidation_suggestions(new_task_id);
CREATE INDEX consolidation_suggestions_existing_task ON consolidation_suggestions(existing_task_id);
