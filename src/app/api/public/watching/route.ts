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
