export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { hasValidSession } from '@/lib/auth'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tag: string }> }
): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { tag } = await params
  const decodedTag = decodeURIComponent(tag)
  const db = getServiceClient()

  // Fetch all tasks that contain this tag
  const { data: tasks, error } = await db
    .from('tasks')
    .select(`
      *,
      task_entities(role, entities(id, name, type))
    `)
    .eq('org_id', ORG_ID)
    .contains('tags', [decodedTag])
    .order('status', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Flatten entities for each task
  const enrichedTasks = (tasks ?? []).map((t: any) => {
    const entities = (t.task_entities ?? []).map((te: any) => ({
      ...(te.entities ?? {}),
      role: te.role,
    }))
    const { task_entities, ...rest } = t
    return { ...rest, entities }
  })

  return NextResponse.json({ tag: decodedTag, tasks: enrichedTasks })
}
