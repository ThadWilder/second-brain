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

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const body = await req.json()
  const { id, status, due_date, escalation } = body

  if (!id) {
    return NextResponse.json({ error: 'Task id required' }, { status: 400 })
  }

  const db = getServiceClient()

  // Fetch previous values before update (for event log)
  let prevStatus: string | null = null
  let prevDueDate: string | null = null
  if (status !== undefined || due_date !== undefined) {
    const { data: prev } = await db.from('tasks').select('status, due_date').eq('id', id).single()
    prevStatus = prev?.status ?? null
    prevDueDate = prev?.due_date ?? null
  }

  const updates: Record<string, unknown> = {}
  if (status !== undefined) updates.status = status
  if (due_date !== undefined) updates.due_date = due_date
  if (escalation !== undefined) updates.escalation = escalation

  if (status === 'done') {
    updates.resolved_at = new Date().toISOString()
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

  return NextResponse.json({ success: true })
}

export async function GET(req: NextRequest): Promise<NextResponse> {
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
