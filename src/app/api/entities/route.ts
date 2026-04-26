export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { hasValidSession } from '@/lib/auth'

export async function GET(): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getServiceClient()
  const { data } = await db
    .from('entities')
    .select('id, name, type')
    .eq('org_id', ORG_ID)
    .eq('archived', false)
    .order('name')

  return NextResponse.json({ entities: data ?? [] })
}
