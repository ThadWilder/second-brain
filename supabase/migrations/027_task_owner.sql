ALTER TABLE tasks ADD COLUMN IF NOT EXISTS owner_email text;
CREATE INDEX IF NOT EXISTS tasks_owner ON tasks(org_id, owner_email, status);
-- Backfill existing tasks to Brandy
UPDATE tasks SET owner_email = 'bmurch@thresholdbrands.com' WHERE owner_email IS NULL;
