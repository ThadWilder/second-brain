-- Allow 'related' as a valid role in task_entities
ALTER TABLE task_entities DROP CONSTRAINT IF EXISTS task_entities_role_check;
ALTER TABLE task_entities ADD CONSTRAINT task_entities_role_check
  CHECK (role IN ('brand', 'assigned_to', 'vendor', 'topic', 'related'));
