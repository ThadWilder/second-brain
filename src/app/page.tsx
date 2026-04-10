/**
 * Main dashboard — four zones:
 *   Zone 1: Status summary + heatmap
 *   Zone 2: Brand cards
 *   Zone 3: Today's priorities
 *   Zone 4: Chat panel
 */

import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { StatusSummary } from '@/components/dashboard/StatusSummary'
import { BrandCards } from '@/components/dashboard/BrandCards'
import { EntityCards } from '@/components/dashboard/EntityCards'
import { ClarificationBanner } from '@/components/dashboard/ClarificationBanner'
import { Priorities } from '@/components/dashboard/Priorities'
import { Heatmap } from '@/components/dashboard/Heatmap'
import { ChatPanel } from '@/components/chat/ChatPanel'
import type {
  DashboardStats,
  BrandSummary,
  TaskWithEntities,
  HeatmapCell,
  Entity,
} from '@/types'

export const dynamic = 'force-dynamic'  // always fetch fresh data

async function getDashboardData() {
  const db = getServiceClient()
  const today = new Date().toISOString().slice(0, 10)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  // Stats
  const [escalationsRes, needsResponseRes, openTasksRes, closed7dRes] = await Promise.all([
    db.from('tasks').select('id', { count: 'exact' }).eq('org_id', ORG_ID).eq('escalation', true).eq('status', 'open'),
    db.from('pending_responses').select('id', { count: 'exact' }).eq('org_id', ORG_ID).eq('responded', false),
    db.from('tasks').select('id', { count: 'exact' }).eq('org_id', ORG_ID).eq('status', 'open'),
    db.from('tasks').select('id', { count: 'exact' }).eq('org_id', ORG_ID).eq('status', 'done').gte('resolved_at', sevenDaysAgo),
  ])

  const stats: DashboardStats = {
    escalations: escalationsRes.count ?? 0,
    needs_response: needsResponseRes.count ?? 0,
    open_tasks: openTasksRes.count ?? 0,
    closed_7d: closed7dRes.count ?? 0,
  }

  // All entities by type
  const { data: allEntities } = await db
    .from('entities')
    .select('*')
    .eq('org_id', ORG_ID)
    .order('name')

  const brandEntities = (allEntities ?? []).filter((e) => e.type === 'brand')
  const contactEntities = (allEntities ?? []).filter((e) => e.type === 'contact')
  const vendorEntities = (allEntities ?? []).filter((e) => e.type === 'vendor')

  // Helper: get task summary for any entity
  async function getEntityTaskSummary(entityId: string) {
    const { data: taskLinks } = await db
      .from('task_entities')
      .select('task_id')
      .eq('entity_id', entityId)

    const taskIds = taskLinks?.map((t) => t.task_id) ?? []
    let openCount = 0
    let escalatedCount = 0
    let lastActivity: string | null = null

    if (taskIds.length > 0) {
      const { data: tasks } = await db
        .from('tasks')
        .select('id, status, escalation, updated_at')
        .in('id', taskIds)

      openCount = tasks?.filter((t) => t.status === 'open').length ?? 0
      escalatedCount = tasks?.filter((t) => t.escalation && t.status === 'open').length ?? 0
      const dates = tasks?.map((t) => t.updated_at).sort().reverse()
      lastActivity = dates?.[0] ?? null
    }

    return { open_tasks: openCount, escalated_tasks: escalatedCount, last_activity: lastActivity }
  }

  // Brand summaries
  const brands: BrandSummary[] = await Promise.all(
    brandEntities.map(async (brand) => {
      const summary = await getEntityTaskSummary(brand.id)
      const health: BrandSummary['health'] =
        summary.escalated_tasks > 0 ? 'red' : summary.open_tasks > 0 ? 'amber' : 'green'
      return { entity: brand, ...summary, health }
    })
  )

  // People summaries
  const people = await Promise.all(
    contactEntities.map(async (contact) => {
      const summary = await getEntityTaskSummary(contact.id)
      return { entity: contact as Entity, ...summary }
    })
  )

  // Vendor summaries
  const vendors = await Promise.all(
    vendorEntities.map(async (vendor) => {
      const summary = await getEntityTaskSummary(vendor.id)
      return { entity: vendor as Entity, ...summary }
    })
  )

  // Pending clarifications
  const { data: clarifications } = await db
    .from('pending_clarifications')
    .select('id, entity_id, question, context, field, suggestions')
    .eq('org_id', ORG_ID)
    .eq('resolved', false)
    .order('created_at', { ascending: true })
    .limit(10)

  // Today's priorities — open tasks, ordered by escalation then due date
  const { data: allOpenTasks } = await db
    .from('tasks')
    .select(`
      *,
      task_entities(role, entities(id, name, type))
    `)
    .eq('org_id', ORG_ID)
    .in('status', ['open', 'blocked'])
    .order('escalation', { ascending: false })
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(50)

  const normalizedTasks: TaskWithEntities[] = (allOpenTasks ?? []).map((t) => ({
    ...t,
    entities: (t.task_entities ?? []).map((te: { role: string; entities: { id: string; name: string; type: string } }) => ({
      ...te.entities,
      role: te.role,
    })),
  }))

  const escalatedTasks = normalizedTasks.filter((t) => t.escalation)
  const regularTasks = normalizedTasks.filter((t) => !t.escalation && t.due_date === today)
  const staleFromYesterday = normalizedTasks.filter(
    (t) => !t.escalation && (!t.due_date || t.due_date < today)
  )

  // Needs response
  const { data: pendingResponses } = await db
    .from('pending_responses')
    .select('id, summary, created_at')
    .eq('org_id', ORG_ID)
    .eq('responded', false)
    .order('created_at', { ascending: true })
    .limit(10)

  // Heatmap data — 14 days
  const { data: entryEntityData } = await db
    .from('entry_entities')
    .select(`
      entries(created_at),
      entities(name, type)
    `)
    .gte('entries.created_at', fourteenDaysAgo)
    .eq('entities.type', 'brand')

  // Build heatmap cells
  const heatmapMap: Record<string, number> = {}
  for (const row of entryEntityData ?? []) {
    const r = row as unknown as { entries: { created_at: string } | null; entities: { name: string; type: string } | null }
    if (!r.entries?.created_at || !r.entities?.name) continue
    const date = r.entries.created_at.slice(0, 10)
    const key = `${r.entities.name}::${date}`
    heatmapMap[key] = (heatmapMap[key] ?? 0) + 1
  }

  const heatmapDays: string[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    heatmapDays.push(d.toISOString().slice(0, 10))
  }

  const heatmapCells: HeatmapCell[] = []
  for (const brand of brandEntities ?? []) {
    for (const day of heatmapDays) {
      heatmapCells.push({
        brand_id: brand.id,
        brand_name: brand.name,
        date: day,
        count: heatmapMap[`${brand.name}::${day}`] ?? 0,
      })
    }
  }

  return {
    stats,
    brands,
    people,
    vendors,
    escalatedTasks,
    regularTasks,
    staleFromYesterday,
    pendingResponses: pendingResponses ?? [],
    heatmapCells,
    heatmapDays,
    brandNames: brandEntities.map((b) => b.name),
    clarifications: clarifications ?? [],
    allEntities: (allEntities ?? []) as Entity[],
  }
}

export default async function DashboardPage() {
  const {
    stats,
    brands,
    people,
    vendors,
    escalatedTasks,
    regularTasks,
    staleFromYesterday,
    pendingResponses,
    heatmapCells,
    heatmapDays,
    brandNames,
    clarifications,
    allEntities: allEntityList,
  } = await getDashboardData()

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col">
      {/* Header */}
      <header className="border-b border-[#2a2d3a] px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-slate-200 font-semibold tracking-tight text-sm">SECOND BRAIN</span>
          <span className="text-xs text-slate-500">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {stats.escalations > 0 && (
            <span className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded">
              {stats.escalations} escalation{stats.escalations !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </header>

      {/* Main layout */}
      <div className="flex-1 flex flex-col lg:flex-row gap-0 overflow-hidden">
        
        {/* Left column — Status + Brand Cards + Priorities */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-5">
            
            {/* Zone 1: Status + Heatmap */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                  Status
                </h2>
                <StatusSummary stats={stats} />
              </div>
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                  Activity (14 days)
                </h2>
                <Heatmap
                  data={heatmapCells}
                  brands={brandNames}
                  days={heatmapDays}
                />
              </div>
            </div>

            {/* Clarification Banner */}
            {clarifications.length > 0 && (
              <ClarificationBanner clarifications={clarifications} />
            )}

            {/* Zone 2: Entity Cards — Brands, People, Vendors */}
            <div className="space-y-5">
              <BrandCards brands={brands} />
              <EntityCards title="People" entities={people} type="contact" allEntities={allEntityList} />
              <EntityCards title="Vendors" entities={vendors} type="vendor" allEntities={allEntityList} />
            </div>

            {/* Zone 3: Priorities */}
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                Today's Priorities
              </h2>
              <Priorities
                escalated={escalatedTasks}
                needsResponse={pendingResponses}
                tasks={regularTasks}
                staleFromYesterday={staleFromYesterday}
              />
            </div>
          </div>
        </div>

        {/* Zone 4: Chat Panel — right sidebar */}
        <div className="lg:w-[380px] border-t lg:border-t-0 lg:border-l border-[#2a2d3a] flex flex-col h-[500px] lg:h-auto">
          <div className="px-4 py-3 border-b border-[#2a2d3a] shrink-0">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Chat
            </h2>
          </div>
          <div className="flex-1 min-h-0">
            <ChatPanel />
          </div>
        </div>
      </div>
    </div>
  )
}
