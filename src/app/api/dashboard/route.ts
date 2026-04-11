export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

/**
 * GET /api/dashboard
 * Returns all dashboard data as JSON for client-side polling.
 */

import { NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { hasValidSession } from '@/lib/auth'
import type { Entity } from '@/types'

export async function GET(): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getServiceClient()
  // Use Eastern time for date grouping
  const estNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const today = estNow.toISOString().slice(0, 10)
  const sevenDaysAgo = new Date(estNow.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const tenDaysAgo = new Date(estNow.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString()

  // Stats
  const [escalationsRes, needsResponseRes, openTasksRes, closed7dRes, waitingOnRes, dumplingsThisWeekRes] = await Promise.all([
    db.from('tasks').select('id', { count: 'exact' }).eq('org_id', ORG_ID).eq('escalation', true).eq('status', 'open'),
    db.from('pending_responses').select('id', { count: 'exact' }).eq('org_id', ORG_ID).eq('responded', false),
    db.from('tasks').select('id', { count: 'exact' }).eq('org_id', ORG_ID).eq('status', 'open'),
    db.from('tasks').select('id', { count: 'exact' }).eq('org_id', ORG_ID).eq('status', 'done').gte('resolved_at', sevenDaysAgo),
    db.from('tasks').select('id', { count: 'exact' }).eq('org_id', ORG_ID).eq('status', 'open').not('waiting_on', 'is', null),
    db.from('entries').select('id', { count: 'exact' }).eq('org_id', ORG_ID).gte('created_at', sevenDaysAgo),
  ])

  const stats = {
    escalations: escalationsRes.count ?? 0,
    needs_response: needsResponseRes.count ?? 0,
    open_tasks: openTasksRes.count ?? 0,
    closed_7d: closed7dRes.count ?? 0,
    waiting_on: waitingOnRes.count ?? 0,
    dumplings_this_week: dumplingsThisWeekRes.count ?? 0,
  }

  // All entities
  const { data: allEntities } = await db.from('entities').select('*').eq('org_id', ORG_ID).eq('archived', false).order('name')
  const brandEntities = (allEntities ?? []).filter((e: Entity) => e.type === 'brand')
  const contactEntities = (allEntities ?? []).filter((e: Entity) => e.type === 'contact')
  const vendorEntities = (allEntities ?? []).filter((e: Entity) => e.type === 'vendor')
  const departmentEntities = (allEntities ?? []).filter((e: Entity) => e.type === 'department')
  const franchiseeEntities = (allEntities ?? []).filter((e: Entity) => e.type === 'franchisee')
  const vendorTeamEntities = (allEntities ?? []).filter((e: Entity) => e.type === 'vendor_team')
  const freelancerEntities = (allEntities ?? []).filter((e: Entity) => e.type === 'freelancer')

  // Entity task summaries
  async function getEntityTaskSummary(entityId: string) {
    const { data: taskLinks } = await db.from('task_entities').select('task_id').eq('entity_id', entityId)
    const taskIds = taskLinks?.map((t: { task_id: string }) => t.task_id) ?? []
    let open_tasks = 0, escalated_tasks = 0, last_activity: string | null = null
    if (taskIds.length > 0) {
      const { data: tasks } = await db.from('tasks').select('id, status, escalation, updated_at').in('id', taskIds)
      open_tasks = tasks?.filter((t: { status: string }) => t.status === 'open' || t.status === 'tracking').length ?? 0
      escalated_tasks = tasks?.filter((t: { escalation: boolean; status: string }) => t.escalation && (t.status === 'open' || t.status === 'tracking')).length ?? 0
      const dates = tasks?.map((t: { updated_at: string }) => t.updated_at).sort().reverse()
      last_activity = dates?.[0] ?? null
    }
    return { open_tasks, escalated_tasks, last_activity }
  }

  const brands = await Promise.all(brandEntities.map(async (b: Entity) => {
    const s = await getEntityTaskSummary(b.id)
    return { entity: b, ...s, health: s.escalated_tasks > 0 ? 'red' : s.open_tasks > 0 ? 'amber' : 'green' }
  }))

  const people = await Promise.all(contactEntities.map(async (c: Entity) => {
    const s = await getEntityTaskSummary(c.id)
    return { entity: c, ...s }
  }))

  const vendors = await Promise.all(vendorEntities.map(async (v: Entity) => {
    const s = await getEntityTaskSummary(v.id)
    return { entity: v, ...s }
  }))

  const departments = await Promise.all(departmentEntities.map(async (d: Entity) => {
    const s = await getEntityTaskSummary(d.id)
    return { entity: d, ...s }
  }))

  const franchisees = await Promise.all(franchiseeEntities.map(async (f: Entity) => {
    const s = await getEntityTaskSummary(f.id)
    return { entity: f, ...s }
  }))

  const vendorTeam = await Promise.all(vendorTeamEntities.map(async (v: Entity) => {
    const s = await getEntityTaskSummary(v.id)
    return { entity: v, ...s }
  }))

  const freelancers = await Promise.all(freelancerEntities.map(async (f: Entity) => {
    const s = await getEntityTaskSummary(f.id)
    return { entity: f, ...s }
  }))

  // Open tasks (includes open, blocked)
  const { data: allOpenTasks } = await db.from('tasks')
    .select('*, task_entities(role, entities(id, name, type))')
    .eq('org_id', ORG_ID).in('status', ['open', 'blocked'])
    .order('escalation', { ascending: false })
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(50)

  // Tracking tasks — for follow-up escalation
  const { data: allTrackingTasks } = await db.from('tasks')
    .select('*, task_entities(role, entities(id, name, type))')
    .eq('org_id', ORG_ID).eq('status', 'tracking')
    .order('follow_up_date', { ascending: true, nullsFirst: false })
    .order('updated_at', { ascending: true })
    .limit(50)

  const normalizedTasks = (allOpenTasks ?? []).map((t: any) => ({
    ...t,
    entities: (t.task_entities ?? []).map((te: any) => ({ ...te.entities, role: te.role })),
  }))

  const normalizedTrackingTasks = (allTrackingTasks ?? []).map((t: any) => ({
    ...t,
    entities: (t.task_entities ?? []).map((te: any) => ({ ...te.entities, role: te.role })),
  }))

  const escalatedTasks = normalizedTasks.filter((t: any) => t.escalation)
  const overdueTasks = normalizedTasks.filter((t: any) => !t.escalation && t.due_date && t.due_date < today)
  const regularTasks = normalizedTasks.filter((t: any) => !t.escalation && t.due_date === today)
  const inboxTasks = normalizedTasks.filter((t: any) => !t.escalation && (!t.due_date || t.due_date > today))

  // Follow-up escalation: tracking tasks that need attention
  const sevenDaysAgoDate = new Date(estNow.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const overdueFollowUps = normalizedTrackingTasks.filter((t: any) => t.follow_up_date && t.follow_up_date <= today)
  const staleTracking = normalizedTrackingTasks.filter((t: any) => !t.follow_up_date && t.updated_at < sevenDaysAgoDate)

  // Pending responses — include entry_id so we can dedupe against tasks
  const { data: rawPendingResponses } = await db.from('pending_responses')
    .select('id, summary, entry_id, created_at').eq('org_id', ORG_ID).eq('responded', false)
    .order('created_at', { ascending: true }).limit(20)

  // Find which tasks share an entry_id with a pending response
  const allTaskEntryIds = new Set(
    [...(allOpenTasks ?? []), ...(allTrackingTasks ?? [])]
      .map((t: any) => t.entry_id)
      .filter(Boolean)
  )
  const needsReplyTaskIds = new Set<string>()
  const pendingResponses = (rawPendingResponses ?? []).filter((pr: any) => {
    if (pr.entry_id && allTaskEntryIds.has(pr.entry_id)) {
      // Find the matching task(s) and mark them as needs-reply
      for (const t of [...(allOpenTasks ?? []), ...(allTrackingTasks ?? [])]) {
        if ((t as any).entry_id === pr.entry_id) needsReplyTaskIds.add((t as any).id)
      }
      return false // hide from standalone pending responses
    }
    return true
  })

  // Clarifications
  const { data: clarifications } = await db.from('pending_clarifications')
    .select('id, entity_id, entry_id, question, context, field, suggestions')
    .eq('org_id', ORG_ID).eq('resolved', false)
    .order('created_at', { ascending: true }).limit(10)

  // Consolidation suggestions — task IDs that have pending suggestions
  const { data: consolidationSuggestions } = await db.from('consolidation_suggestions')
    .select('id, new_task_id, existing_task_id, merged_description, reason, created_at')
    .eq('org_id', ORG_ID).eq('status', 'pending')
    .order('created_at', { ascending: true }).limit(20)

  // Entity relationships (for grouping people by their org)
  const { data: entityRelationshipsData } = await db
    .from('entity_relationships')
    .select('from_entity_id, to_entity_id, relationship')
    .eq('org_id', ORG_ID)

  // Heatmap
  const { data: entryEntityData } = await db.from('entry_entities')
    .select('entries(created_at), entities(name, type)')
    .gte('entries.created_at', tenDaysAgo).eq('entities.type', 'brand')

  const heatmapMap: Record<string, number> = {}
  for (const row of entryEntityData ?? []) {
    const r = row as unknown as { entries: { created_at: string } | null; entities: { name: string } | null }
    if (!r.entries?.created_at || !r.entities?.name) continue
    // Convert UTC timestamp to EST date
    const entryDate = new Date(new Date(r.entries.created_at).toLocaleString('en-US', { timeZone: 'America/New_York' }))
    const date = entryDate.toISOString().slice(0, 10)
    heatmapMap[`${r.entities.name}::${date}`] = (heatmapMap[`${r.entities.name}::${date}`] ?? 0) + 1
  }

  const heatmapDays: string[] = []
  for (let i = 9; i >= 0; i--) {
    heatmapDays.push(new Date(estNow.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
  }

  const heatmapBrands = brandEntities.filter((b: Entity) => b.name !== 'Riverside Company')
  const heatmapCells = heatmapBrands.flatMap((b: Entity) =>
    heatmapDays.map((day) => ({
      brand_id: b.id, brand_name: b.name, date: day,
      count: heatmapMap[`${b.name}::${day}`] ?? 0,
    }))
  )

  // Build a set of task IDs that have pending consolidation suggestions
  const consolidationTaskIds = new Set<string>()
  for (const cs of consolidationSuggestions ?? []) {
    consolidationTaskIds.add(cs.new_task_id)
    consolidationTaskIds.add(cs.existing_task_id)
  }

  return NextResponse.json({
    stats, brands, people, vendors, departments, franchisees, vendorTeam, freelancers,
    escalatedTasks, overdueTasks, regularTasks, inboxTasks,
    overdueFollowUps, staleTracking,
    pendingResponses,
    needsReplyTaskIds: [...needsReplyTaskIds],
    clarifications: clarifications ?? [],
    consolidationSuggestions: consolidationSuggestions ?? [],
    consolidationTaskIds: [...consolidationTaskIds],
    heatmapCells, heatmapDays,
    brandNames: heatmapBrands.map((b: Entity) => b.name),
    allEntities: allEntities ?? [],
    entityRelationships: entityRelationshipsData ?? [],
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
    },
  })
}
