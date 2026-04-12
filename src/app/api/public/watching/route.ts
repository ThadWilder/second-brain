export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = new URL(req.url).searchParams.get('token')
  if (!process.env.PUBLIC_SHARE_TOKEN || token !== process.env.PUBLIC_SHARE_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getServiceClient()

  const { data: tasks } = await db
    .from('tasks')
    .select('id, description, status, waiting_on, tracked_owner, follow_up_date, due_date, updated_at, created_at, task_entities(role, entities(id, name, type))')
    .eq('org_id', ORG_ID)
    .eq('status', 'tracking')
    .order('follow_up_date', { ascending: true, nullsFirst: false })
    .order('updated_at', { ascending: true })

  const normalized = (tasks ?? []).map((t: any) => ({
    id: t.id,
    description: t.description,
    waiting_on: t.waiting_on,
    tracked_owner: t.tracked_owner,
    follow_up_date: t.follow_up_date,
    due_date: t.due_date,
    updated_at: t.updated_at,
    created_at: t.created_at,
    brand: (t.task_entities ?? []).find((te: any) => te.role === 'brand')?.entities?.name ?? null,
  }))

  return NextResponse.json({ tasks: normalized }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = new URL(req.url).searchParams.get('token')
  if (!process.env.PUBLIC_SHARE_TOKEN || token !== process.env.PUBLIC_SHARE_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { description, owner, brand_name } = await req.json()

  if (!description?.trim()) {
    return NextResponse.json({ error: 'Description required' }, { status: 400 })
  }

  const db = getServiceClient()

  // Create task directly as tracking
  const { data: task, error } = await db
    .from('tasks')
    .insert({
      org_id: ORG_ID,
      description: description.trim(),
      status: 'tracking',
      tracked_owner: owner?.trim() || null,
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Link to brand if provided
  if (brand_name && task) {
    const { data: brand } = await db
      .from('entities')
      .select('id')
      .eq('org_id', ORG_ID)
      .ilike('name', brand_name.trim())
      .limit(1)
      .maybeSingle()

    if (brand) {
      await db.from('task_entities').insert({
        task_id: task.id,
        entity_id: brand.id,
        role: 'brand',
      })
    }
  }

  // Log creation event
  await db.from('task_events').insert({
    task_id: task.id,
    event_type: 'created',
    metadata: { source: 'public_watching', owner: owner?.trim() || null },
  })

  return NextResponse.json({ success: true, task_id: task.id }, { status: 201 })
}
