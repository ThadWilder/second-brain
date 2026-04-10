export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

/**
 * GET /api/dashboard
 * Returns all dashboard data as JSON for client-side polling.
 */

import { NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import type { Entity } from '@/types'

export async function GET(): Promise<NextResponse> {
  const db = getServiceClient()
  const today = new Date().toISOString().slice(0, 10)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()

  // Stats
  const [escalationsRes, needsResponseRes, openTasksRes, closed7dRes] = await Promise.all([
    db.from('tasks').select('id', { count: 'exact' }).eq('org_id', ORG_ID).eq('escalation', true).eq('status', 'open'),
    db.from('pending_responses').select('id', { count: 'exact' }).eq('org_id', ORG_ID).eq('responded', false),
    db.from('tasks').select('id', { count: 'exact' }).eq('org_id', ORG_ID).eq('status', 'open'),
    db.from('tasks').select('id', { count: 'exact' }).eq('org_id', ORG_ID).eq('status', 'done').gte('resolved_at', sevenDaysAgo),
  ])

  const stats = {
    escalations: escalationsRes.count ?? 0,
    needs_response: needsResponseRes.count ?? 0,
    open_tasks: openTasksRes.count ?? 0,
    closed_7d: closed7dRes.count ?? 0,
  }

  // All entities
  const { data: allEntities } = await db.from('entities').select('*').eq('org_id', ORG_ID).order('name')
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
      open_tasks = tasks?.filter((t: { status: string }) => t.status === 'open').length ?? 0
      escalated_tasks = tasks?.filter((t: { escalation: boolean; status: string }) => t.escalation && t.status === 'open').length ?? 0
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

  // Open tasks
  const { data: allOpenTasks } = await db.from('tasks')
    .select('*, task_entities(role, entities(id, name, type))')
    .eq('org_id', ORG_ID).in('status', ['open', 'blocked'])
    .order('escalation', { ascending: false })
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(50)

  const normalizedTasks = (allOpenTasks ?? []).map((t: any) => ({
    ...t,
    entities: (t.task_entities ?? []).map((te: any) => ({ ...te.entities, role: te.role })),
  }))

  const escalatedTasks = normalizedTasks.filter((t: any) => t.escalation)
  const regularTasks = normalizedTasks.filter((t: any) => !t.escalation && t.due_date === today)
  const staleFromYesterday = normalizedTasks.filter((t: any) => !t.escalation && (!t.due_date || t.due_date < today))

  // Pending responses
  const { data: pendingResponses } = await db.from('pending_responses')
    .select('id, summary, created_at').eq('org_id', ORG_ID).eq('responded', false)
    .order('created_at', { ascending: true }).limit(10)

  // Clarifications
  const { data: clarifications } = await db.from('pending_clarifications')
    .select('id, entity_id, question, context, field, suggestions')
    .eq('org_id', ORG_ID).eq('resolved', false)
    .order('created_at', { ascending: true }).limit(10)

  // Heatmap
  const { data: entryEntityData } = await db.from('entry_entities')
    .select('entries(created_at), entities(name, type)')
    .gte('entries.created_at', tenDaysAgo).eq('entities.type', 'brand')

  const heatmapMap: Record<string, number> = {}
  for (const row of entryEntityData ?? []) {
    const r = row as unknown as { entries: { created_at: string } | null; entities: { name: string } | null }
    if (!r.entries?.created_at || !r.entities?.name) continue
    const date = r.entries.created_at.slice(0, 10)
    heatmapMap[`${r.entities.name}::${date}`] = (heatmapMap[`${r.entities.name}::${date}`] ?? 0) + 1
  }

  const heatmapDays: string[] = []
  for (let i = 9; i >= 0; i--) {
    heatmapDays.push(new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
  }

  const heatmapCells = brandEntities.flatMap((b: Entity) =>
    heatmapDays.map((day) => ({
      brand_id: b.id, brand_name: b.name, date: day,
      count: heatmapMap[`${b.name}::${day}`] ?? 0,
    }))
  )

  return NextResponse.json({
    stats, brands, people, vendors, departments, franchisees, vendorTeam, freelancers,
    escalatedTasks, regularTasks, staleFromYesterday,
    pendingResponses: pendingResponses ?? [],
    clarifications: clarifications ?? [],
    heatmapCells, heatmapDays,
    brandNames: brandEntities.map((b: Entity) => b.name),
    allEntities: allEntities ?? [],
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
    },
  })
}
