/**
 * Shared helpers for inserting wiki_queue rows when tasks or pending responses change.
 * Wiki queue failures are non-critical — they are caught and logged, never thrown.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { ORG_ID } from '@/lib/supabase'

function triggerWikiProcessor() {
  fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://dumpbox.app'}/api/wiki/process`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET || ''}` },
  }).catch(() => {})
}

/**
 * Queue wiki updates for all entities linked to a task.
 * Uses the task's entry_id as the source entry reference.
 */
export async function queueWikiUpdatesForTask(
  db: SupabaseClient,
  taskId: string
): Promise<void> {
  try {
    // Get the task's entry_id
    const { data: task } = await db
      .from('tasks')
      .select('entry_id')
      .eq('id', taskId)
      .single()

    const entryId = task?.entry_id

    // Get all linked entity IDs
    const { data: links } = await db
      .from('task_entities')
      .select('entity_id')
      .eq('task_id', taskId)

    if (!links?.length) return

    const entityIds = [...new Set(links.map((l) => l.entity_id))]

    await db.from('wiki_queue').insert(
      entityIds.map((entityId) => ({
        org_id: ORG_ID,
        entry_id: entryId,
        entity_id: entityId,
        status: 'pending',
      }))
    )

    triggerWikiProcessor()
  } catch (err) {
    console.error('Failed to queue wiki updates for task:', taskId, err)
  }
}

/**
 * Queue wiki updates for all entities linked to a pending response.
 * Uses the pending response's entry_id as the source entry reference.
 */
export async function queueWikiUpdatesForPendingResponse(
  db: SupabaseClient,
  pendingResponseId: string
): Promise<void> {
  try {
    // Get the pending response's entry_id
    const { data: pr } = await db
      .from('pending_responses')
      .select('entry_id')
      .eq('id', pendingResponseId)
      .single()

    const entryId = pr?.entry_id

    // Get all linked entity IDs
    const { data: links } = await db
      .from('pending_response_entities')
      .select('entity_id')
      .eq('pending_response_id', pendingResponseId)

    if (!links?.length) return

    const entityIds = [...new Set(links.map((l) => l.entity_id))]

    await db.from('wiki_queue').insert(
      entityIds.map((entityId) => ({
        org_id: ORG_ID,
        entry_id: entryId,
        entity_id: entityId,
        status: 'pending',
      }))
    )

    triggerWikiProcessor()
  } catch (err) {
    console.error('Failed to queue wiki updates for pending response:', pendingResponseId, err)
  }
}

/**
 * Queue wiki updates for a specific set of entity IDs (used by merge route
 * where entity links are already gathered).
 */
export async function queueWikiUpdatesForEntities(
  db: SupabaseClient,
  entityIds: string[],
  entryId: string | null
): Promise<void> {
  try {
    if (!entityIds.length) return

    const unique = [...new Set(entityIds)]

    await db.from('wiki_queue').insert(
      unique.map((entityId) => ({
        org_id: ORG_ID,
        entry_id: entryId,
        entity_id: entityId,
        status: 'pending',
      }))
    )

    triggerWikiProcessor()
  } catch (err) {
    console.error('Failed to queue wiki updates for entities:', err)
  }
}
