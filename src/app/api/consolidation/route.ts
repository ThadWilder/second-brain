export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { hasValidSession } from '@/lib/auth'

/**
 * POST /api/consolidation
 * Accept or dismiss a consolidation suggestion.
 *
 * Body: { suggestion_id, action: 'accept' | 'dismiss' }
 *
 * Accept: merges the two tasks — keeps the existing task with the merged description,
 * marks the new task as done, and resolves the suggestion.
 * Dismiss: resolves the suggestion without merging.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { suggestion_id, action } = await req.json()

  if (!suggestion_id || !['accept', 'dismiss'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const db = getServiceClient()

  // Fetch the suggestion
  const { data: suggestion, error: fetchError } = await db
    .from('consolidation_suggestions')
    .select('*')
    .eq('id', suggestion_id)
    .eq('org_id', ORG_ID)
    .eq('status', 'pending')
    .single()

  if (fetchError || !suggestion) {
    return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 })
  }

  const now = new Date().toISOString()

  if (action === 'accept') {
    // Update the existing task with the merged description
    await db
      .from('tasks')
      .update({
        description: suggestion.merged_description,
        updated_at: now,
      })
      .eq('id', suggestion.existing_task_id)

    // Log a task event on the existing task
    await db.from('task_events').insert({
      task_id: suggestion.existing_task_id,
      event_type: 'note_added',
      metadata: { note: `Merged with related task: ${suggestion.reason}` },
    })

    // Mark the new task as done (consolidated)
    await db
      .from('tasks')
      .update({
        status: 'done',
        resolved_at: now,
        updated_at: now,
      })
      .eq('id', suggestion.new_task_id)

    // Log a task event on the new task
    await db.from('task_events').insert({
      task_id: suggestion.new_task_id,
      event_type: 'status_change',
      metadata: { from: 'open', to: 'done', reason: 'Consolidated with existing task' },
    })

    // Copy entity links from the new task to the existing task (don't duplicate)
    const { data: newTaskEntities } = await db
      .from('task_entities')
      .select('entity_id, role')
      .eq('task_id', suggestion.new_task_id)

    for (const te of newTaskEntities ?? []) {
      await db.from('task_entities').upsert(
        {
          task_id: suggestion.existing_task_id,
          entity_id: te.entity_id,
          role: te.role,
        },
        { onConflict: 'task_id,entity_id,role', ignoreDuplicates: true }
      )
    }
  }

  // Mark the suggestion as resolved
  await db
    .from('consolidation_suggestions')
    .update({
      status: action === 'accept' ? 'accepted' : 'dismissed',
      resolved_at: now,
    })
    .eq('id', suggestion_id)

  return NextResponse.json({ success: true, action })
}
