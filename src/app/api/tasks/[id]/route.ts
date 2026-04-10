export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
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
          .select('id, raw_text, source, created_at')
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
