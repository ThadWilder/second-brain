-- 006_rls.sql
-- Enable Row Level Security on all tables.
-- Service role bypasses RLS automatically in Supabase.
-- With RLS enabled and no permissive policies for anon, the anon key has zero access.

-- ── Tables WITH org_id ──────────────────────────────────────────────

ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE nudge_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE wiki_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE wiki_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_clarifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_relationships ENABLE ROW LEVEL SECURITY;

-- Org-scoped policies for authenticated users (service_role bypasses these)
CREATE POLICY entries_org_isolation ON entries
  FOR ALL USING (org_id = '00000000-0000-0000-0000-000000000001');

CREATE POLICY entities_org_isolation ON entities
  FOR ALL USING (org_id = '00000000-0000-0000-0000-000000000001');

CREATE POLICY tasks_org_isolation ON tasks
  FOR ALL USING (org_id = '00000000-0000-0000-0000-000000000001');

CREATE POLICY decisions_org_isolation ON decisions
  FOR ALL USING (org_id = '00000000-0000-0000-0000-000000000001');

CREATE POLICY pending_responses_org_isolation ON pending_responses
  FOR ALL USING (org_id = '00000000-0000-0000-0000-000000000001');

CREATE POLICY nudge_messages_org_isolation ON nudge_messages
  FOR ALL USING (org_id = '00000000-0000-0000-0000-000000000001');

CREATE POLICY conversations_org_isolation ON conversations
  FOR ALL USING (org_id = '00000000-0000-0000-0000-000000000001');

CREATE POLICY wiki_pages_org_isolation ON wiki_pages
  FOR ALL USING (org_id = '00000000-0000-0000-0000-000000000001');

CREATE POLICY wiki_log_org_isolation ON wiki_log
  FOR ALL USING (org_id = '00000000-0000-0000-0000-000000000001');

CREATE POLICY pending_clarifications_org_isolation ON pending_clarifications
  FOR ALL USING (org_id = '00000000-0000-0000-0000-000000000001');

CREATE POLICY entity_relationships_org_isolation ON entity_relationships
  FOR ALL USING (org_id = '00000000-0000-0000-0000-000000000001');

-- ── Junction tables WITHOUT org_id ──────────────────────────────────
-- These need RLS enabled to block anon, with permissive policies for
-- authenticated users (service_role bypasses automatically).

ALTER TABLE entity_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_response_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE nudge_message_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE wiki_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY entity_aliases_service_access ON entity_aliases
  FOR ALL USING (true);

CREATE POLICY entry_entities_service_access ON entry_entities
  FOR ALL USING (true);

CREATE POLICY task_entities_service_access ON task_entities
  FOR ALL USING (true);

CREATE POLICY task_events_service_access ON task_events
  FOR ALL USING (true);

CREATE POLICY decision_entities_service_access ON decision_entities
  FOR ALL USING (true);

CREATE POLICY pending_response_entities_service_access ON pending_response_entities
  FOR ALL USING (true);

CREATE POLICY nudge_message_tasks_service_access ON nudge_message_tasks
  FOR ALL USING (true);

CREATE POLICY messages_service_access ON messages
  FOR ALL USING (true);

CREATE POLICY wiki_links_service_access ON wiki_links
  FOR ALL USING (true);
