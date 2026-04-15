export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { rateLimit } from '@/lib/rate-limit'

function validateToken(req: NextRequest): boolean {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  return !!process.env.PUBLIC_SHARE_TOKEN && token === process.env.PUBLIC_SHARE_TOKEN
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  const rl = rateLimit(`public-comments:${ip}`, 60)
  if (rl.limited) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  if (!validateToken(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const taskId = new URL(req.url).searchParams.get('task_id')
  if (!taskId) {
    return NextResponse.json({ error: 'task_id required' }, { status: 400 })
  }

  const db = getServiceClient()

  const { data: comments, error } = await db
    .from('task_comments')
    .select('id, author_name, author_email, content, is_resolved, created_at')
    .eq('task_id', taskId)
    .eq('org_id', ORG_ID)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ comments: comments ?? [] })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  const rl = rateLimit(`public-comments:${ip}`, 30)
  if (rl.limited) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  if (!validateToken(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { task_id, author_name, author_email, content } = await req.json()

  if (!task_id || !author_name?.trim() || !content?.trim()) {
    return NextResponse.json({ error: 'task_id, author_name, and content are required' }, { status: 400 })
  }

  const db = getServiceClient()

  // Verify the task exists and is public
  const { data: task } = await db
    .from('tasks')
    .select('id')
    .eq('id', task_id)
    .eq('org_id', ORG_ID)
    .eq('public', true)
    .single()

  if (!task) {
    return NextResponse.json({ error: 'Task not found or not public' }, { status: 404 })
  }

  const { data: comment, error } = await db
    .from('task_comments')
    .insert({
      org_id: ORG_ID,
      task_id,
      author_name: author_name.trim(),
      author_email: author_email?.trim() || null,
      content: content.trim(),
    })
    .select('id, author_name, author_email, content, is_resolved, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ comment }, { status: 201 })
}
