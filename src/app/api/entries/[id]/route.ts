export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params
  const db = getServiceClient()

  const { data: entry, error } = await db
    .from('entries')
    .select('id, raw_text, source, source_meta, created_at')
    .eq('id', id)
    .eq('org_id', ORG_ID)
    .single()

  if (error || !entry) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ entry })
}
