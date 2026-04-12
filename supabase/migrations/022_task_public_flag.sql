-- Add public flag to tasks for visibility on shared watching page
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS public boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS tasks_public ON tasks(org_id, public, status);
