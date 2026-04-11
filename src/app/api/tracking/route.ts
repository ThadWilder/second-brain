export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { hasValidSession } from '@/lib/auth'

export async function GET(): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getServiceClient()
  const { data, error } = await db
    .from('tracked_items')
    .select('*, entities:brand_entity_id(id, name)')
    .eq('org_id', ORG_ID)
    .order('status', { ascending: true })
    .order('follow_up_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ items: data ?? [] })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { title, description, owner, brand_entity_id, follow_up_date, data_source, data_source_url, notes } = body

  if (!title?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  const db = getServiceClient()
  const { data, error } = await db
    .from('tracked_items')
    .insert({
      org_id: ORG_ID,
      title: title.trim(),
      description: description?.trim() || null,
      owner: owner?.trim() || null,
      brand_entity_id: brand_entity_id || null,
      follow_up_date: follow_up_date || null,
      data_source: data_source?.trim() || null,
      data_source_url: data_source_url?.trim() || null,
      notes: notes?.trim() || null,
    })
    .select('*, entities:brand_entity_id(id, name)')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
