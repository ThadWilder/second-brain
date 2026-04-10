export const dynamic = 'force-dynamic'

/**
 * POST /api/entities/link — create a relationship between two entities
 * DELETE /api/entities/link — remove a relationship
 * GET /api/entities/link?entity_id=xxx — get all relationships for an entity
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { hasValidSession } from '@/lib/auth'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { from_entity_id, to_entity_id, relationship } = await req.json()

  if (!from_entity_id || !to_entity_id || !relationship) {
    return NextResponse.json({ error: 'Missing from_entity_id, to_entity_id, or relationship' }, { status: 400 })
  }

  const db = getServiceClient()

  const { error } = await db
    .from('entity_relationships')
    .upsert(
      { org_id: ORG_ID, from_entity_id, to_entity_id, relationship },
      { onConflict: 'from_entity_id,to_entity_id,relationship', ignoreDuplicates: true }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const db = getServiceClient()
  const { error } = await db.from('entity_relationships').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const entityId = new URL(req.url).searchParams.get('entity_id')
  if (!entityId) return NextResponse.json({ error: 'Missing entity_id' }, { status: 400 })

  const db = getServiceClient()

  // Get relationships in both directions
  const [outbound, inbound] = await Promise.all([
    db.from('entity_relationships')
      .select('id, relationship, to_entity_id, metadata, entities!entity_relationships_to_entity_id_fkey(id, name, type)')
      .eq('from_entity_id', entityId)
      .eq('org_id', ORG_ID),
    db.from('entity_relationships')
      .select('id, relationship, from_entity_id, metadata, entities!entity_relationships_from_entity_id_fkey(id, name, type)')
      .eq('to_entity_id', entityId)
      .eq('org_id', ORG_ID),
  ])

  return NextResponse.json({
    outbound: outbound.data ?? [],
    inbound: inbound.data ?? [],
  })
}
