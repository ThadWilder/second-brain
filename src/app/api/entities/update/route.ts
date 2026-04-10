export const dynamic = 'force-dynamic'

/**
 * PATCH /api/entities/update
 * Update entity metadata — name, role, company, notes, category, etc.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { hasValidSession } from '@/lib/auth'

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { entity_id, name, type, metadata, archived } = await req.json()

  if (!entity_id) {
    return NextResponse.json({ error: 'Missing entity_id' }, { status: 400 })
  }

  const db = getServiceClient()

  // Load current entity
  const { data: entity, error: fetchError } = await db
    .from('entities')
    .select('*')
    .eq('id', entity_id)
    .single()

  if (fetchError || !entity) {
    return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
  }

  const updates: Record<string, unknown> = {}

  // Update name if provided
  if (name && name !== entity.name) {
    updates.name = name
    updates.normalized_name = name.toLowerCase().trim().replace(/\s+/g, ' ')
  }

  // Merge metadata — new values override, existing values preserved
  if (metadata) {
    const currentMeta = (entity.metadata as Record<string, unknown>) ?? {}
    updates.metadata = { ...currentMeta, ...metadata }
  }

  // Change type
  if (type && type !== entity.type) {
    updates.type = type
  }

  // Archive/unarchive
  if (typeof archived === 'boolean') {
    updates.archived = archived
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: true, message: 'No changes' })
  }

  const { error: updateError } = await db
    .from('entities')
    .update(updates)
    .eq('id', entity_id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
