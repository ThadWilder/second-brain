export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { hasValidSession } from '@/lib/auth'
import { anthropic, CLAUDE_MODEL } from '@/lib/claude'

/** POST /api/wiki/:slug/instruct — use Claude to update wiki page based on user instruction */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { slug } = await params
  const body = await req.json()
  const instruction = body.instruction?.trim()

  if (!instruction) {
    return NextResponse.json({ error: 'Instruction is required' }, { status: 400 })
  }

  const db = getServiceClient()

  // Fetch current wiki page
  const { data: page, error: findErr } = await db
    .from('wiki_pages')
    .select('id, content, title')
    .eq('org_id', ORG_ID)
    .eq('slug', slug)
    .single()

  if (findErr || !page) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 })
  }

  // Call Claude to rewrite the page
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    system: `You are editing a wiki page for an entity in a business management app. You will receive the current page content and a user instruction describing what to change. Rewrite the wiki page incorporating the user's instruction. Preserve the existing structure and sections (## headers). Only modify what's needed to address the instruction. Keep all other content intact. Return ONLY the full updated wiki page content in markdown — no preamble, no explanation, no code fences.`,
    messages: [
      {
        role: 'user',
        content: `Current wiki page "${page.title}":\n\n${page.content}\n\n---\n\nThe user wants you to make this change:\n${instruction}`,
      },
    ],
  })

  const updatedContent = response.content[0].type === 'text' ? response.content[0].text : ''

  if (!updatedContent) {
    return NextResponse.json({ error: 'Claude returned empty content' }, { status: 500 })
  }

  // Save updated content
  const { error: updateErr } = await db
    .from('wiki_pages')
    .update({
      content: updatedContent,
      last_manual_edit: new Date().toISOString(),
    })
    .eq('id', page.id)

  if (updateErr) {
    return NextResponse.json({ error: 'Failed to save updated content' }, { status: 500 })
  }

  // Log the instruction edit
  await db.from('wiki_log').insert({
    org_id: ORG_ID,
    event_type: 'manual_edit',
    page_id: page.id,
    note: `claude instruction: ${instruction.slice(0, 200)}`,
  })

  return NextResponse.json({ ok: true, content: updatedContent })
}
