/**
 * Escalation logic — rules-based, no ML.
 *
 * Rules (from spec):
 *   - task.due_date < today AND status = 'open'            → escalate
 *   - waiting_on set AND updated_at > 48hrs ago             → escalate
 *   - nudged 3+ times with no response                      → escalate
 *   - pending_response older than 24hrs                     → surface
 *   - task marked done                                       → de-escalate
 *   - new task_events row linked to task                    → de-escalate
 *   - due_date pushed forward                               → de-escalate
 *
 * Run this as part of the cron briefing job to keep escalation flags fresh.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { ORG_ID } from './supabase'

export async function runEscalationPass(db: SupabaseClient): Promise<{
  escalated: number
  deEscalated: number
}> {
  let escalated = 0
  let deEscalated = 0

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const cutoff48h = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString()

  // ── 1. Escalate: overdue ─────────────────
  const { data: overdue } = await db
    .from('tasks')
    .select('id')
    .eq('org_id', ORG_ID)
    .eq('status', 'open')
    .eq('escalation', false)
    .lt('due_date', today)
    .not('due_date', 'is', null)

  for (const task of overdue ?? []) {
    await escalateTask(db, task.id, 'overdue')
    escalated++
  }

  // ── 2. Escalate: waiting_on + no update in 48h ──────
  const { data: staleWaiting } = await db
    .from('tasks')
    .select('id')
    .eq('org_id', ORG_ID)
    .eq('status', 'open')
    .eq('escalation', false)
    .not('waiting_on', 'is', null)
    .lt('updated_at', cutoff48h)

  for (const task of staleWaiting ?? []) {
    await escalateTask(db, task.id, 'waiting_on_stale')
    escalated++
  }

  // ── 3. Escalate: nudged 3+ times, no response ────────
  // Get all task IDs that have been nudged, then count client-side
  const { data: nudgeEvents } = await db
    .from('task_events')
    .select('task_id')
    .eq('event_type', 'nudged')

  // Count nudges per task
  const nudgeCounts: Record<string, number> = {}
  for (const row of nudgeEvents ?? []) {
    nudgeCounts[row.task_id] = (nudgeCounts[row.task_id] ?? 0) + 1
  }

  const frequentlyNudgedIds = Object.entries(nudgeCounts)
    .filter(([, count]) => count >= 3)
    .map(([taskId]) => taskId)

  for (const taskId of frequentlyNudgedIds) {
    // Only escalate open tasks that aren't already escalated
    const { data: task } = await db
      .from('tasks')
      .select('id, escalation, status')
      .eq('id', taskId)
      .single()

    if (task && !task.escalation && task.status === 'open') {
      await escalateTask(db, taskId, 'nudged_no_response')
      escalated++
    }
  }

  // ── 4. De-escalate: done tasks ───────────────────────
  const { data: doneTasks } = await db
    .from('tasks')
    .select('id')
    .eq('org_id', ORG_ID)
    .eq('status', 'done')
    .eq('escalation', true)

  for (const task of doneTasks ?? []) {
    await deEscalateTask(db, task.id, 'task_done')
    deEscalated++
  }

  return { escalated, deEscalated }
}

export async function escalateTask(
  db: SupabaseClient,
  taskId: string,
  reason: string
): Promise<void> {
  await db.from('tasks').update({ escalation: true }).eq('id', taskId)
  await db.from('task_events').insert({
    task_id: taskId,
    event_type: 'escalated',
    metadata: { reason },
  })
}

export async function deEscalateTask(
  db: SupabaseClient,
  taskId: string,
  reason: string
): Promise<void> {
  await db.from('tasks').update({ escalation: false }).eq('id', taskId)
  await db.from('task_events').insert({
    task_id: taskId,
    event_type: 'de_escalated',
    metadata: { reason },
  })
}

/**
 * Build escalation context for briefings — returns a structured summary
 */
export async function getEscalationContext(db: SupabaseClient): Promise<{
  escalations: Array<{ task: string; brand: string; reason: string }>
  needsResponse: Array<{ summary: string; age_hours: number }>
}> {
  // Escalated tasks with brand
  const { data: escalatedTasks } = await db
    .from('tasks')
    .select(`
      id, description, updated_at,
      task_entities(entity_id, role, entities(name))
    `)
    .eq('org_id', ORG_ID)
    .in('status', ['open', 'tracking'])
    .eq('escalation', true)
    .order('updated_at', { ascending: true })

  const escalations = (escalatedTasks ?? []).map((t) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const brandEntity = (t.task_entities as any[])?.find((te) => te.role === 'brand')
    return {
      task: t.description,
      brand: brandEntity?.entities?.name ?? 'Unknown',
      reason: 'escalated',
    }
  })

  // Pending responses older than 24h
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: staleResponses } = await db
    .from('pending_responses')
    .select('id, summary, created_at')
    .eq('org_id', ORG_ID)
    .eq('responded', false)
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })

  const needsResponse = (staleResponses ?? []).map((pr) => ({
    summary: pr.summary,
    age_hours: Math.round(
      (Date.now() - new Date(pr.created_at).getTime()) / (60 * 60 * 1000)
    ),
  }))

  return { escalations, needsResponse }
}
