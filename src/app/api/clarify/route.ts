export const dynamic = 'force-dynamic'

/**
 * POST /api/clarify
 * Resolve a pending clarification — updates the entity metadata and marks resolved.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { clarification_id, resolution, entity_id } = await req.json()

  if (!clarification_id || !resolution) {
    return NextResponse.json({ error: 'Missing clarification_id or resolution' }, { status: 400 })
  }

  const db = getServiceClient()

  // Mark clarification resolved
  await db
    .from('pending_clarifications')
    .update({
      resolved: true,
      resolution,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', clarification_id)

  // Update entity metadata with the resolved category
  if (entity_id) {
    const { data: entity } = await db
      .from('entities')
      .select('metadata')
      .eq('id', entity_id)
      .single()

    const currentMeta = (entity?.metadata as Record<string, unknown>) ?? {}
    const updatedMeta = { ...currentMeta, category: resolution }

    await db
      .from('entities')
      .update({ metadata: updatedMeta })
      .eq('id', entity_id)
  }

  return NextResponse.json({ success: true })
}
