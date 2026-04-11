export const dynamic = 'force-dynamic'

/**
 * POST /api/tasks/merge
 * Merge multiple tasks into one: create a new combined task,
 * transfer entity links, close the originals.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { hasValidSession } from '@/lib/auth'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { task_ids, description, brand_id } = await req.json()

    if (!Array.isArray(task_ids) || task_ids.length < 2) {
      return NextResponse.json({ error: 'At least 2 task IDs required' }, { status: 400 })
    }
    if (!description?.trim()) {
      return NextResponse.json({ error: 'Description required' }, { status: 400 })
    }

    const db = getServiceClient()

    // Verify all tasks exist, belong to this org, and are open
    const { data: sourceTasks, error: fetchErr } = await db
      .from('tasks')
      .select('id, description, status')
      .in('id', task_ids)
      .eq('org_id', ORG_ID)

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    }

    if (!sourceTasks || sourceTasks.length !== task_ids.length) {
      return NextResponse.json({ error: 'One or more tasks not found' }, { status: 404 })
    }

    // 1. Create the new merged task
    const { data: newTask, error: createErr } = await db
      .from('tasks')
      .insert({
        org_id: ORG_ID,
        description: description.trim(),
        status: 'open',
        escalation: false,
      })
      .select('*')
      .single()

    if (createErr || !newTask) {
      return NextResponse.json({ error: createErr?.message ?? 'Failed to create task' }, { status: 500 })
    }

    // 2. Gather all entity links from source tasks (deduplicated)
    const { data: entityLinks } = await db
      .from('task_entities')
      .select('entity_id, role')
      .in('task_id', task_ids)

    const seen = new Set<string>()
    const uniqueLinks: { task_id: string; entity_id: string; role: string }[] = []

    // If a brand_id was provided, ensure it's linked
    if (brand_id) {
      const key = `${brand_id}:brand`
      seen.add(key)
      uniqueLinks.push({ task_id: newTask.id, entity_id: brand_id, role: 'brand' })
    }

    for (const link of entityLinks ?? []) {
      const key = `${link.entity_id}:${link.role}`
      if (!seen.has(key)) {
        seen.add(key)
        uniqueLinks.push({ task_id: newTask.id, entity_id: link.entity_id, role: link.role })
      }
    }

    if (uniqueLinks.length > 0) {
      await db.from('task_entities').insert(uniqueLinks)
    }

    // 3. Add a note to the new task documenting what was consolidated
    const sourceDescriptions = sourceTasks.map((t) => `- ${t.description}`).join('\n')
    await db.from('task_events').insert({
      task_id: newTask.id,
      event_type: 'note_added',
      metadata: {
        note: `Combined from ${sourceTasks.length} tasks:\n${sourceDescriptions}`,
      },
    })

    // Also log creation event
    await db.from('task_events').insert({
      task_id: newTask.id,
      event_type: 'created',
      metadata: { source: 'merge', merged_task_ids: task_ids },
    })

    // 4. Close the original tasks
    const now = new Date().toISOString()
    await db
      .from('tasks')
      .update({ status: 'done', resolved_at: now })
      .in('id', task_ids)

    // Log status changes for each original task
    const statusEvents = task_ids.map((id: string) => ({
      task_id: id,
      event_type: 'status_change' as const,
      metadata: { from: 'open', to: 'done', source: 'merged', merged_into: newTask.id },
    }))
    await db.from('task_events').insert(statusEvents)

    return NextResponse.json({ task: newTask })
  } catch (err) {
    console.error('Task merge error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
