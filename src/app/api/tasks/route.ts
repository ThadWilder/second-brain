export const dynamic = 'force-dynamic'

/**
 * PATCH /api/tasks
 * Quick task status update — used by Zone 3 checkboxes.
 *
 * GET /api/tasks
 * Fetch tasks for dashboard.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { deEscalateTask } from '@/lib/escalation'
import { hasValidSession } from '@/lib/auth'
import { queueWikiUpdatesForTask } from '@/lib/wiki-queue'

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { id, status, due_date, escalation, waiting_on, tracked_owner, follow_up_date, description, public: isPublic, tags } = body

  if (!id) {
    return NextResponse.json({ error: 'Task id required' }, { status: 400 })
  }

  const db = getServiceClient()

  // Fetch previous values before update (for event log)
  let prevStatus: string | null = null
  let prevDueDate: string | null = null
  let prevWaitingOn: string | null = null
  let prevEntryId: string | null = null
  if (status !== undefined || due_date !== undefined || waiting_on !== undefined || tracked_owner !== undefined || follow_up_date !== undefined) {
    const { data: prev } = await db.from('tasks').select('status, due_date, waiting_on, entry_id').eq('id', id).single()
    prevStatus = prev?.status ?? null
    prevDueDate = prev?.due_date ?? null
    prevWaitingOn = prev?.waiting_on ?? null
    prevEntryId = prev?.entry_id ?? null
  }

  const updates: Record<string, unknown> = {}
  if (description !== undefined) updates.description = description
  if (isPublic !== undefined) updates.public = isPublic
  if (status !== undefined) updates.status = status
  if (due_date !== undefined) updates.due_date = due_date
  if (escalation !== undefined) updates.escalation = escalation
  if (waiting_on !== undefined) updates.waiting_on = waiting_on || null
  if (tracked_owner !== undefined) updates.tracked_owner = tracked_owner || null
  if (follow_up_date !== undefined) updates.follow_up_date = follow_up_date || null
  if (tags !== undefined) updates.tags = tags

  if (status === 'done') {
    updates.resolved_at = new Date().toISOString()
  } else if (status === 'open' && (prevStatus === 'done' || prevStatus === 'dismissed')) {
    updates.resolved_at = null
  }

  // Clear tracking fields when moving away from tracking status
  if (status !== undefined && status !== 'tracking' && prevStatus === 'tracking') {
    if (tracked_owner === undefined) updates.tracked_owner = null
    if (follow_up_date === undefined) updates.follow_up_date = null
  }

  const { error } = await db.from('tasks').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log status change event
  if (status !== undefined) {
    await db.from('task_events').insert({
      task_id: id,
      event_type: 'status_change',
      metadata: { from: prevStatus, to: status, source: 'checkbox' },
    })
    if (status === 'done') {
      await deEscalateTask(db, id, 'task_done')
      // Auto-resolve pending responses from the same source entry
      if (prevEntryId) {
        await db.from('pending_responses')
          .update({ responded: true })
          .eq('entry_id', prevEntryId)
          .eq('responded', false)
      }
    }
  }

  // Log due_date change and de-escalate if pushed forward
  if (due_date !== undefined && due_date !== prevDueDate) {
    await db.from('task_events').insert({
      task_id: id,
      event_type: 'due_date_changed',
      metadata: { from: prevDueDate, to: due_date },
    })
    // De-escalate if due date was pushed forward (later than before)
    if (due_date && (!prevDueDate || due_date > prevDueDate)) {
      await deEscalateTask(db, id, 'due_date_pushed')
    }
  }

  // Log waiting_on change
  if (waiting_on !== undefined && (waiting_on || null) !== prevWaitingOn) {
    await db.from('task_events').insert({
      task_id: id,
      event_type: 'note_added',
      metadata: waiting_on
        ? { note: `Waiting on set to "${waiting_on}"` }
        : { note: `No longer waiting on "${prevWaitingOn}"` },
    })
  }

  // Log tracked_owner change
  if (tracked_owner !== undefined) {
    await db.from('task_events').insert({
      task_id: id,
      event_type: 'note_added',
      metadata: tracked_owner
        ? { note: `Tracked owner set to "${tracked_owner}"` }
        : { note: 'Tracked owner cleared' },
    })
  }

  // Log follow_up_date change
  if (follow_up_date !== undefined) {
    await db.from('task_events').insert({
      task_id: id,
      event_type: 'note_added',
      metadata: follow_up_date
        ? { note: `Follow-up date set to ${follow_up_date}` }
        : { note: 'Follow-up date cleared' },
    })
  }

  // Queue wiki updates for linked entities (fire-and-forget)
  if (status !== undefined || due_date !== undefined || waiting_on !== undefined || tracked_owner !== undefined || follow_up_date !== undefined) {
    queueWikiUpdatesForTask(db, id)
  }

  return NextResponse.json({ success: true })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { description, entry_id, brand_name, status: taskStatus } = await req.json()
  if (!description?.trim()) {
    return NextResponse.json({ error: 'Description required' }, { status: 400 })
  }

  const db = getServiceClient()

  const { data: task, error } = await db
    .from('tasks')
    .insert({
      org_id: ORG_ID,
      description: description.trim(),
      status: taskStatus || 'open',
      entry_id: entry_id || null,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Link to brand if provided
  if (brand_name && task) {
    const { data: brand } = await db
      .from('entities')
      .select('id')
      .eq('org_id', ORG_ID)
      .ilike('name', brand_name.trim())
      .limit(1)
      .maybeSingle()

    if (brand) {
      await db.from('task_entities').insert({ task_id: task.id, entity_id: brand.id, role: 'brand' })
    }
  }

  await db.from('task_events').insert({ task_id: task.id, event_type: 'created', metadata: { source: 'manual' } })

  return NextResponse.json({ task_id: task.id }, { status: 201 })
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const brand_id = searchParams.get('brand_id')
  const status = searchParams.get('status')
  const escalation = searchParams.get('escalation')

  const db = getServiceClient()

  let query = db
    .from('tasks')
    .select(`
      *,
      task_entities(role, entities(id, name, type))
    `)
    .eq('org_id', ORG_ID)
    .order('escalation', { ascending: false })
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (escalation === 'true') query = query.eq('escalation', true)

  if (brand_id) {
    const { data: taskIds } = await db
      .from('task_entities')
      .select('task_id')
      .eq('entity_id', brand_id)
      .eq('role', 'brand')

    if (taskIds?.length) {
      query = query.in('id', taskIds.map((t) => t.task_id))
    } else {
      return NextResponse.json({ tasks: [] })
    }
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ tasks: data ?? [] })
}
