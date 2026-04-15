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

  // Verify task belongs to org
  const { data: task } = await db
    .from('tasks')
    .select('id')
    .eq('id', id)
    .eq('org_id', ORG_ID)
    .single()

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  const { data: comments, error } = await db
    .from('task_comments')
    .select('id, author_name, author_email, content, is_resolved, created_at')
    .eq('task_id', id)
    .eq('org_id', ORG_ID)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ comments: comments ?? [] })
}
