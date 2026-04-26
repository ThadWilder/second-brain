export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { hasValidSession } from '@/lib/auth'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const db = getServiceClient()

  // Fetch the project entity
  const { data: project, error: projectError } = await db
    .from('entities')
    .select('id, name, normalized_name, metadata, first_seen, last_seen, created_at')
    .eq('id', id)
    .eq('org_id', ORG_ID)
    .eq('type', 'project')
    .single()

  if (projectError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Fetch related task IDs via task_entities
  const { data: taskEntityRows } = await db
    .from('task_entities')
    .select('task_id')
    .eq('entity_id', id)
    .eq('role', 'project')

  const taskIds = (taskEntityRows ?? []).map((r) => r.task_id)

  let tasks: {
    id: string
    description: string
    status: string
    due_date: string | null
    waiting_on: string | null
    created_at: string
    updated_at: string
  }[] = []

  if (taskIds.length > 0) {
    const { data: taskRows } = await db
      .from('tasks')
      .select('id, description, status, due_date, waiting_on, created_at, updated_at')
      .in('id', taskIds)
      .neq('status', 'dismissed')
      .order('status', { ascending: true }) // open before done
      .order('created_at', { ascending: false })

    tasks = taskRows ?? []
  }

  // Check if a wiki page exists for this entity
  const { data: wikiPage } = await db
    .from('wiki_pages')
    .select('slug')
    .eq('entity_id', id)
    .single()

  return NextResponse.json({
    project,
    tasks,
    wiki_slug: wikiPage?.slug ?? null,
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json()
  const db = getServiceClient()

  // Fetch existing metadata first
  const { data: existing, error: fetchError } = await db
    .from('entities')
    .select('metadata')
    .eq('id', id)
    .eq('org_id', ORG_ID)
    .eq('type', 'project')
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const currentMeta = (existing.metadata as Record<string, unknown>) ?? {}
  const updates: Record<string, unknown> = {}

  if (body.name !== undefined) {
    updates.name = body.name.trim()
    updates.normalized_name = body.name.trim().toLowerCase().replace(/\s+/g, ' ')
  }

  if (body.status !== undefined || body.description !== undefined || body.target_date !== undefined) {
    updates.metadata = {
      ...currentMeta,
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.target_date !== undefined ? { target_date: body.target_date } : {}),
    }
  }

  const { data, error } = await db
    .from('entities')
    .update(updates)
    .eq('id', id)
    .eq('org_id', ORG_ID)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ project: data })
}
