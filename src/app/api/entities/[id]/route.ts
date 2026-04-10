export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params
  const db = getServiceClient()

  const { data: entity, error } = await db
    .from('entities')
    .select('id, name, type, normalized_name, metadata, first_seen, last_seen')
    .eq('id', id)
    .eq('org_id', ORG_ID)
    .single()

  if (error || !entity) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ entity })
}
