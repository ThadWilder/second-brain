export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { hasValidSession } from '@/lib/auth'

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, commentId } = await params
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

  const { error } = await db
    .from('task_comments')
    .update({ is_resolved: true })
    .eq('id', commentId)
    .eq('task_id', id)
    .eq('org_id', ORG_ID)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
