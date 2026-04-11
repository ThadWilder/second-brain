-- waiting_on and waiting_on_entity_id already exist in 001_initial_schema.sql
-- This migration adds an index for efficient filtering of waiting-on tasks.

CREATE INDEX IF NOT EXISTS tasks_waiting_on
  ON tasks(org_id)
  WHERE waiting_on IS NOT NULL AND status = 'open';
