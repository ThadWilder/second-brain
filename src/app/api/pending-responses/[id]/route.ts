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

  const { data: pr, error } = await db
    .from('pending_responses')
    .select('*')
    .eq('id', id)
    .eq('org_id', ORG_ID)
    .single()

  if (error || !pr) {
    return NextResponse.json({ error: 'Pending response not found' }, { status: 404 })
  }

  // Fetch source entry and linked entities in parallel
  const [sourceResult, entitiesResult] = await Promise.all([
    pr.entry_id
      ? db
          .from('entries')
          .select('id, raw_text, source, created_at')
          .eq('id', pr.entry_id)
          .single()
      : Promise.resolve({ data: null }),
    db
      .from('pending_response_entities')
      .select('role, entities(id, name, type)')
      .eq('pending_response_id', id),
  ])

  const entities = (entitiesResult.data ?? []).map((pe: Record<string, unknown>) => ({
    ...(pe.entities as Record<string, unknown>),
    role: pe.role,
  }))

  return NextResponse.json({
    pending_response: pr,
    source_entry: sourceResult.data ?? null,
    entities,
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json()
  const db = getServiceClient()

  // Add note — store in metadata.notes array
  if (body.add_note) {
    const { data: pr } = await db
      .from('pending_responses')
      .select('metadata')
      .eq('id', id)
      .eq('org_id', ORG_ID)
      .single()

    const meta = (pr?.metadata ?? {}) as Record<string, unknown>
    const notes = (meta.notes as Array<{ text: string; created_at: string }>) ?? []
    notes.push({ text: body.add_note, created_at: new Date().toISOString() })

    await db
      .from('pending_responses')
      .update({ metadata: { ...meta, notes } })
      .eq('id', id)
      .eq('org_id', ORG_ID)

    return NextResponse.json({ success: true })
  }

  const updates: Record<string, unknown> = {}
  if (body.responded !== undefined) updates.responded = body.responded

  const { error } = await db
    .from('pending_responses')
    .update(updates)
    .eq('id', id)
    .eq('org_id', ORG_ID)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
