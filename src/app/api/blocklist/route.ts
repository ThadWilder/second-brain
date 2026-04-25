export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { hasValidSession } from '@/lib/auth'
import { addToBlocklist, removeFromBlocklist, listBlocklist } from '@/lib/blocklist'

export async function GET(): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const entries = await listBlocklist()
  return NextResponse.json({ entries })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { pattern, type } = await req.json()
  if (!pattern || !type || !['url', 'sender'].includes(type)) {
    return NextResponse.json({ error: 'pattern and type (url|sender) required' }, { status: 400 })
  }

  const entry = await addToBlocklist(pattern, type)
  return NextResponse.json({ entry })
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await removeFromBlocklist(id)
  return NextResponse.json({ ok: true })
}
