import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { BrandDetail } from '@/components/brand/BrandDetail'
import { ChatPanel } from '@/components/chat/ChatPanel'
import type { Task, Decision, Entry, Entity } from '@/types'

interface Props {
  params: { id: string }
}

export const revalidate = 30

async function getBrandData(brandId: string) {
  const db = getServiceClient()

  // Brand entity
  const { data: brand } = await db
    .from('entities')
    .select('*')
    .eq('id', brandId)
    .eq('org_id', ORG_ID)
    .single()

  if (!brand) return null

  // Tasks for this brand
  const { data: taskEntityLinks } = await db
    .from('task_entities')
    .select('task_id')
    .eq('entity_id', brandId)
    .eq('role', 'brand')

  const taskIds = taskEntityLinks?.map((t) => t.task_id) ?? []

  let tasks: Task[] = []
  if (taskIds.length > 0) {
    const { data: taskData } = await db
      .from('tasks')
      .select('*')
      .in('id', taskIds)
      .order('escalation', { ascending: false })
      .order('created_at', { ascending: false })
    tasks = (taskData ?? []) as Task[]
  }

  // Entries linked to this brand
  const { data: entryEntityLinks } = await db
    .from('entry_entities')
    .select('entry_id')
    .eq('entity_id', brandId)
    .eq('relationship', 'about')
    .limit(50)

  const entryIds = entryEntityLinks?.map((e) => e.entry_id) ?? []

  let entries: Entry[] = []
  if (entryIds.length > 0) {
    const { data: entryData } = await db
      .from('entries')
      .select('*')
      .in('id', entryIds)
      .eq('processing_status', 'done')
      .order('created_at', { ascending: false })
    entries = (entryData ?? []) as Entry[]
  }

  // Decisions linked to this brand
  const { data: decisionEntityLinks } = await db
    .from('decision_entities')
    .select('decision_id')
    .eq('entity_id', brandId)

  const decisionIds = decisionEntityLinks?.map((d) => d.decision_id) ?? []

  let decisions: Decision[] = []
  if (decisionIds.length > 0) {
    const { data: decisionData } = await db
      .from('decisions')
      .select('*')
      .in('id', decisionIds)
      .order('created_at', { ascending: false })
    decisions = (decisionData ?? []) as Decision[]
  }

  // Other entities linked to tasks or entries for this brand
  const linkedEntityIds = new Set<string>()
  if (taskIds.length > 0) {
    const { data: taskEntityData } = await db
      .from('task_entities')
      .select('entity_id')
      .in('task_id', taskIds)
      .neq('entity_id', brandId)
    taskEntityData?.forEach((te) => linkedEntityIds.add(te.entity_id))
  }

  let linkedEntities: Entity[] = []
  if (linkedEntityIds.size > 0) {
    const { data: entityData } = await db
      .from('entities')
      .select('*')
      .in('id', [...linkedEntityIds])
    linkedEntities = (entityData ?? []) as Entity[]
  }

  return { brand, tasks, entries, decisions, linkedEntities }
}

export default async function BrandPage({ params }: Props) {
  const data = await getBrandData(params.id)

  if (!data) notFound()

  const { brand, tasks, entries, decisions, linkedEntities } = data

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col">
      {/* Header */}
      <header className="border-b border-[#2a2d3a] px-4 py-3 flex items-center gap-3 shrink-0">
        <Link
          href="/"
          className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
        >
          ← Back
        </Link>
        <span className="text-slate-600">/</span>
        <span className="text-slate-200 font-medium text-sm">{brand.name}</span>
      </header>

      {/* Main layout */}
      <div className="flex-1 flex flex-col lg:flex-row gap-0 overflow-hidden">
        {/* Brand detail */}
        <div className="flex-1 overflow-y-auto p-4">
          <BrandDetail
            brand={brand}
            tasks={tasks}
            decisions={decisions}
            entries={entries}
            entities={linkedEntities}
          />
        </div>

        {/* Chat panel */}
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
