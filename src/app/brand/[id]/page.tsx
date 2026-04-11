import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, ListTodo, BookOpen, Users } from 'lucide-react'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { BrandDetail } from '@/components/brand/BrandDetail'
import { WikiSection } from '@/components/brand/WikiSection'
import type { Task, Decision, Entry, Entity } from '@/types'

interface Props {
  params: Promise<{ id: string }>
}

export const dynamic = 'force-dynamic'

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

  // Wiki page for this entity
  const slug = (brand.normalized_name as string).replace(/\s+/g, '-')
  const { data: wikiPage } = await db
    .from('wiki_pages')
    .select('*, entities(type, name)')
    .eq('org_id', ORG_ID)
    .eq('slug', slug)
    .single()

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
      .in('id', Array.from(linkedEntityIds))
    linkedEntities = (entityData ?? []) as Entity[]
  }

  return { brand, tasks, entries, decisions, linkedEntities, wikiPage }
}

export default async function BrandPage({ params }: Props) {
  const { id } = await params
  const data = await getBrandData(id)

  if (!data) notFound()

  const { brand, tasks, entries, decisions, linkedEntities, wikiPage } = data

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col">
      {/* Header */}
      <header className="border-b border-[var(--border)] px-4 py-3 flex items-center gap-3 shrink-0">
        <Link
          href="/"
          className="text-[var(--muted)] hover:text-[var(--text)] text-sm transition-colors flex items-center gap-2"
        >
          <Image src="/logo-icon.png" alt="Dumpbox" width={24} height={24} />
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </Link>
        <span className="text-[var(--border)]">/</span>
        <span className="text-[var(--text)] font-medium text-sm">{brand.name}</span>
      </header>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto px-4 py-4 space-y-6">
          {/* Wiki content — shown first */}
          <WikiSection
            wikiPage={wikiPage}
            brandName={brand.name}
            slug={(brand.normalized_name as string).replace(/\s+/g, '-')}
          />

          {/* Existing tabs (tasks, entries, decisions) */}
          <BrandDetail
            brand={brand}
            tasks={tasks}
            decisions={decisions}
            entries={entries}
            entities={linkedEntities}
          />
        </div>
      </div>
    </div>
  )
}
