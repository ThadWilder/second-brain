export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { hasValidSession } from '@/lib/auth'

export async function GET(): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getServiceClient()

  const { data, error } = await db.rpc('get_tag_counts', { p_org_id: ORG_ID })

  if (error) {
    // Fallback: raw SQL via a direct query if the RPC doesn't exist
    const { data: tasks, error: tasksError } = await db
      .from('tasks')
      .select('tags')
      .eq('org_id', ORG_ID)
      .neq('tags', '{}')

    if (tasksError) {
      return NextResponse.json({ error: tasksError.message }, { status: 500 })
    }

    // Count tags client-side
    const counts: Record<string, number> = {}
    for (const task of tasks ?? []) {
      for (const tag of task.tags ?? []) {
        counts[tag] = (counts[tag] || 0) + 1
      }
    }

    const tags = Object.entries(counts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => a.tag.localeCompare(b.tag))

    return NextResponse.json({ tags })
  }

  return NextResponse.json({ tags: data ?? [] })
}
