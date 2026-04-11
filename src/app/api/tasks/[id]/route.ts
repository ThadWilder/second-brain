export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { hasValidSession } from '@/lib/auth'
import { queueWikiUpdatesForTask } from '@/lib/wiki-queue'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const { add_note, link_entity_id, link_role } = await req.json()
  const db = getServiceClient()

  if (link_entity_id) {
    await db.from('task_entities').insert({
      task_id: id,
      entity_id: link_entity_id,
      role: link_role || 'related',
    })
    return NextResponse.json({ success: true })
  }

  if (add_note) {
    // Add a note as a task_event
    await db.from('task_events').insert({
      task_id: id,
      event_type: 'note_added',
      metadata: { note: add_note },
    })

    // Update task's updated_at
    await db.from('tasks').update({ updated_at: new Date().toISOString() }).eq('id', id)

    // Queue wiki updates for linked entities (fire-and-forget)
    queueWikiUpdatesForTask(db, id)

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'No action specified' }, { status: 400 })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const { entity_id } = await req.json()
  const db = getServiceClient()

  if (!entity_id) {
    return NextResponse.json({ error: 'entity_id required' }, { status: 400 })
  }

  // Verify the task belongs to this org before deleting
  const { data: task } = await db
    .from('tasks')
    .select('id')
    .eq('id', id)
    .eq('org_id', ORG_ID)
    .single()

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  await db
    .from('task_entities')
    .delete()
    .eq('task_id', id)
    .eq('entity_id', entity_id)

  return NextResponse.json({ success: true })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const db = getServiceClient()

  // Fetch task
  const { data: task, error: taskError } = await db
    .from('tasks')
    .select('*')
    .eq('id', id)
    .eq('org_id', ORG_ID)
    .single()

  if (taskError || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  // Fetch entities, events, source entry, and consolidation suggestions in parallel
  const [entitiesResult, eventsResult, sourceResult, consolidationAsNew, consolidationAsExisting] = await Promise.all([
    db
      .from('task_entities')
      .select('role, entities(id, name, type)')
      .eq('task_id', id),
    db
      .from('task_events')
      .select('id, event_type, metadata, created_at')
      .eq('task_id', id)
      .order('created_at', { ascending: true }),
    task.entry_id
      ? db
          .from('entries')
          .select('id, raw_text, source, source_meta, created_at')
          .eq('id', task.entry_id)
          .single()
      : Promise.resolve({ data: null }),
    db
      .from('consolidation_suggestions')
      .select('id, new_task_id, existing_task_id, merged_description, reason, created_at')
      .eq('new_task_id', id)
      .eq('status', 'pending'),
    db
      .from('consolidation_suggestions')
      .select('id, new_task_id, existing_task_id, merged_description, reason, created_at')
      .eq('existing_task_id', id)
      .eq('status', 'pending'),
  ])

  const entities = (entitiesResult.data ?? []).map((te: Record<string, unknown>) => ({
    ...(te.entities as Record<string, unknown>),
    role: te.role,
  }))

  // Combine consolidation suggestions from both directions and fetch other task descriptions
  const rawSuggestions = [
    ...(consolidationAsNew.data ?? []).map((cs: any) => ({
      id: cs.id,
      direction: 'new' as const,
      other_task_id: cs.existing_task_id,
      merged_description: cs.merged_description,
      reason: cs.reason,
      created_at: cs.created_at,
    })),
    ...(consolidationAsExisting.data ?? []).map((cs: any) => ({
      id: cs.id,
      direction: 'existing' as const,
      other_task_id: cs.new_task_id,
      merged_description: cs.merged_description,
      reason: cs.reason,
      created_at: cs.created_at,
    })),
  ]

  // Fetch descriptions for related tasks
  const otherTaskIds = rawSuggestions.map((s) => s.other_task_id)
  let otherTaskMap: Record<string, string> = {}
  if (otherTaskIds.length > 0) {
    const { data: otherTasks } = await db
      .from('tasks')
      .select('id, description')
      .in('id', otherTaskIds)
    for (const t of otherTasks ?? []) {
      otherTaskMap[t.id] = t.description
    }
  }

  const consolidationSuggestions = rawSuggestions.map((s) => ({
    ...s,
    other_task_description: otherTaskMap[s.other_task_id] ?? null,
  }))

  return NextResponse.json({
    task,
    entities,
    events: eventsResult.data ?? [],
    source_entry: sourceResult.data ?? null,
    consolidation_suggestions: consolidationSuggestions,
  })
}
