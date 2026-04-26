export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { hasValidSession } from '@/lib/auth'

export async function GET(): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getServiceClient()

  // Fetch all project entities
  const { data: projects, error } = await db
    .from('entities')
    .select('id, name, normalized_name, metadata, first_seen, last_seen, created_at')
    .eq('org_id', ORG_ID)
    .eq('type', 'project')
    .eq('archived', false)
    .order('last_seen', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!projects || projects.length === 0) {
    return NextResponse.json({ projects: [] })
  }

  const projectIds = projects.map((p) => p.id)

  // Fetch task counts per project via task_entities with role='project'
  const { data: taskRows } = await db
    .from('task_entities')
    .select('entity_id, tasks!inner(status)')
    .in('entity_id', projectIds)
    .eq('role', 'project')

  // Build count map
  const countMap: Record<string, { open: number; done: number }> = {}
  for (const id of projectIds) {
    countMap[id] = { open: 0, done: 0 }
  }
  if (taskRows) {
    for (const row of taskRows) {
      const tasks = row.tasks as unknown as { status: string } | { status: string }[]
      const taskList = Array.isArray(tasks) ? tasks : [tasks]
      for (const t of taskList) {
        if (!countMap[row.entity_id]) countMap[row.entity_id] = { open: 0, done: 0 }
        if (t.status === 'done') countMap[row.entity_id].done++
        else countMap[row.entity_id].open++
      }
    }
  }

  const enriched = projects.map((p) => ({
    ...p,
    task_counts: countMap[p.id] ?? { open: 0, done: 0 },
  }))

  return NextResponse.json({ projects: enriched })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { name, description, target_date } = body

  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const db = getServiceClient()
  const trimmedName = name.trim()
  const normalizedName = trimmedName.toLowerCase().replace(/\s+/g, ' ')

  const { data, error } = await db
    .from('entities')
    .insert({
      org_id: ORG_ID,
      type: 'project',
      name: trimmedName,
      normalized_name: normalizedName,
      metadata: {
        status: 'active',
        description: description?.trim() || null,
        target_date: target_date || null,
      },
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ project: data }, { status: 201 })
}
