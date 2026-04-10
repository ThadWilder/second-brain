-- Atomic entity merge: moves all references from source → target, then deletes source.
-- Runs as a single transaction — any failure rolls back everything.

CREATE OR REPLACE FUNCTION merge_entities(
  p_source_id UUID,
  p_target_id UUID,
  p_org_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_source RECORD;
  v_target RECORD;
  v_result JSONB;
BEGIN
  -- Validate both entities exist and belong to the org
  SELECT * INTO v_source FROM entities WHERE id = p_source_id AND org_id = p_org_id;
  SELECT * INTO v_target FROM entities WHERE id = p_target_id AND org_id = p_org_id;

  IF v_source IS NULL THEN
    RAISE EXCEPTION 'Source entity not found';
  END IF;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'Target entity not found';
  END IF;

  -- ── 1. entry_entities (unique on entry_id, entity_id, relationship) ──
  UPDATE entry_entities SET entity_id = p_target_id
  WHERE entity_id = p_source_id
  AND NOT EXISTS (
    SELECT 1 FROM entry_entities e2
    WHERE e2.entity_id = p_target_id
      AND e2.entry_id = entry_entities.entry_id
      AND e2.relationship = entry_entities.relationship
  );
  DELETE FROM entry_entities WHERE entity_id = p_source_id;

  -- ── 2. task_entities (unique on task_id, entity_id, role) ────────────
  UPDATE task_entities SET entity_id = p_target_id
  WHERE entity_id = p_source_id
  AND NOT EXISTS (
    SELECT 1 FROM task_entities t2
    WHERE t2.entity_id = p_target_id
      AND t2.task_id = task_entities.task_id
      AND t2.role = task_entities.role
  );
  DELETE FROM task_entities WHERE entity_id = p_source_id;

  -- ── 3. decision_entities (unique on decision_id, entity_id, role) ────
  UPDATE decision_entities SET entity_id = p_target_id
  WHERE entity_id = p_source_id
  AND NOT EXISTS (
    SELECT 1 FROM decision_entities d2
    WHERE d2.entity_id = p_target_id
      AND d2.decision_id = decision_entities.decision_id
      AND d2.role = decision_entities.role
  );
  DELETE FROM decision_entities WHERE entity_id = p_source_id;

  -- ── 4. pending_response_entities (unique on pending_response_id, entity_id, role)
  UPDATE pending_response_entities SET entity_id = p_target_id
  WHERE entity_id = p_source_id
  AND NOT EXISTS (
    SELECT 1 FROM pending_response_entities pr2
    WHERE pr2.entity_id = p_target_id
      AND pr2.pending_response_id = pending_response_entities.pending_response_id
      AND pr2.role = pending_response_entities.role
  );
  DELETE FROM pending_response_entities WHERE entity_id = p_source_id;

  -- ── 5. tasks.waiting_on_entity_id ────────────────────────────────────
  UPDATE tasks SET waiting_on_entity_id = p_target_id
  WHERE waiting_on_entity_id = p_source_id;

  -- ── 6. entity_relationships (unique on from_entity_id, to_entity_id, relationship)
  -- Rewire outgoing: source→X becomes target→X (skip if target→X already exists)
  UPDATE entity_relationships SET from_entity_id = p_target_id
  WHERE from_entity_id = p_source_id
  AND NOT EXISTS (
    SELECT 1 FROM entity_relationships er2
    WHERE er2.from_entity_id = p_target_id
      AND er2.to_entity_id = entity_relationships.to_entity_id
      AND er2.relationship = entity_relationships.relationship
  );
  DELETE FROM entity_relationships WHERE from_entity_id = p_source_id;

  -- Rewire incoming: X→source becomes X→target (skip if X→target already exists)
  UPDATE entity_relationships SET to_entity_id = p_target_id
  WHERE to_entity_id = p_source_id
  AND NOT EXISTS (
    SELECT 1 FROM entity_relationships er2
    WHERE er2.to_entity_id = p_target_id
      AND er2.from_entity_id = entity_relationships.from_entity_id
      AND er2.relationship = entity_relationships.relationship
  );
  DELETE FROM entity_relationships WHERE to_entity_id = p_source_id;

  -- Remove self-referencing relationships created by the rewiring
  DELETE FROM entity_relationships
  WHERE from_entity_id = p_target_id AND to_entity_id = p_target_id;

  -- ── 7. entity_aliases (unique on normalized_alias, entity_id) ────────
  -- Move source's aliases to target (skip duplicates)
  UPDATE entity_aliases SET entity_id = p_target_id
  WHERE entity_id = p_source_id
  AND NOT EXISTS (
    SELECT 1 FROM entity_aliases a2
    WHERE a2.entity_id = p_target_id
      AND a2.normalized_alias = entity_aliases.normalized_alias
  );
  DELETE FROM entity_aliases WHERE entity_id = p_source_id;

  -- Add the source entity's name as an alias on the target
  INSERT INTO entity_aliases (entity_id, alias, normalized_alias)
  VALUES (p_target_id, v_source.name, v_source.normalized_name)
  ON CONFLICT (normalized_alias, entity_id) DO NOTHING;

  -- ── 8. wiki_pages (unique on org_id, slug) ──────────────────────────
  UPDATE wiki_pages SET entity_id = p_target_id
  WHERE entity_id = p_source_id
  AND NOT EXISTS (
    SELECT 1 FROM wiki_pages w2
    WHERE w2.entity_id = p_target_id AND w2.slug = wiki_pages.slug
  );
  DELETE FROM wiki_pages WHERE entity_id = p_source_id;

  -- ── 9. pending_clarifications ────────────────────────────────────────
  UPDATE pending_clarifications SET entity_id = p_target_id
  WHERE entity_id = p_source_id;

  -- ── 10. Update timestamps and metadata on target ─────────────────────
  UPDATE entities SET
    first_seen = LEAST(v_target.first_seen, v_source.first_seen),
    last_seen = GREATEST(v_target.last_seen, v_source.last_seen),
    metadata = COALESCE(v_source.metadata, '{}'::jsonb) || COALESCE(v_target.metadata, '{}'::jsonb)
  WHERE id = p_target_id;

  -- ── 11. Delete source entity ─────────────────────────────────────────
  DELETE FROM entities WHERE id = p_source_id;

  v_result := jsonb_build_object(
    'success', true,
    'source_name', v_source.name,
    'target_name', v_target.name,
    'target_id', p_target_id
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;
