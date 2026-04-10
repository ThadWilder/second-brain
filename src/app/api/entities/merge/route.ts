export const dynamic = 'force-dynamic'

/**
 * POST /api/entities/merge
 *
 * Atomically merge a duplicate entity into a canonical one via a single
 * Postgres function call. All FK rewiring, alias registration, metadata
 * merging, and deletion happen inside one transaction.
 *
 * Body: { canonical_id, duplicate_id }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { hasValidSession } from '@/lib/auth'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { canonical_id, duplicate_id } = await req.json()

  if (!canonical_id || !duplicate_id) {
    return NextResponse.json({ error: 'Missing canonical_id or duplicate_id' }, { status: 400 })
  }

  if (canonical_id === duplicate_id) {
    return NextResponse.json({ error: 'Cannot merge entity into itself' }, { status: 400 })
  }

  const db = getServiceClient()

  const { data, error } = await db.rpc('merge_entities', {
    p_source_id: duplicate_id,
    p_target_id: canonical_id,
    p_org_id: ORG_ID,
  })

  if (error) {
    const status = error.message?.includes('not found') ? 404 : 500
    return NextResponse.json({ error: error.message }, { status })
  }

  return NextResponse.json(data)
}
