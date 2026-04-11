-- Add tracking columns to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tracked_owner text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS follow_up_date date;

-- Update status constraint to include 'tracking'
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (status = ANY (ARRAY['open', 'done', 'blocked', 'dismissed', 'tracking']));

-- Index for follow-up date queries
CREATE INDEX IF NOT EXISTS tasks_follow_up ON tasks(org_id, follow_up_date) WHERE status = 'tracking' AND follow_up_date IS NOT NULL;
