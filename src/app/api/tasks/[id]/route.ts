export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { hasValidSession } from '@/lib/auth'

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

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'No action specified' }, { status: 400 })
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

  // Fetch entities, events, and source entry in parallel
  const [entitiesResult, eventsResult, sourceResult] = await Promise.all([
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
  ])

  const entities = (entitiesResult.data ?? []).map((te: Record<string, unknown>) => ({
    ...(te.entities as Record<string, unknown>),
    role: te.role,
  }))

  return NextResponse.json({
    task,
    entities,
    events: eventsResult.data ?? [],
    source_entry: sourceResult.data ?? null,
  })
}
