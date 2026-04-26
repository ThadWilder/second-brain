export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { anthropic, CLAUDE_MODEL_FAST } from '@/lib/claude'
import { hasValidSession } from '@/lib/auth'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { task_description, status, waiting_on, tracked_owner, entities, prompt } = await req.json()

  const people = (entities ?? [])
    .filter((e: any) => ['contact', 'vendor_team', 'freelancer', 'franchisee'].includes(e.type))
    .map((e: any) => e.name)

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL_FAST,
    max_tokens: 512,
    system: `You draft short, professional emails for a marketing agency VP (Brandy Murch at Threshold Brands). Be direct, warm, and concise. No filler. Write only the email body, no subject line. NEVER use em dashes (—) anywhere in the email. Use commas, periods, or colons instead.`,
    messages: [{
      role: 'user',
      content: `Draft an email about this task:

Task: ${task_description}
Status: ${status}${waiting_on ? `\nWaiting on: ${waiting_on}` : ''}${tracked_owner ? `\nOwner: ${tracked_owner}` : ''}
People involved: ${people.length > 0 ? people.join(', ') : 'none specified'}

My notes/direction: ${prompt}

Write a brief email I can send to the relevant people.`,
    }],
  })

  const email = response.content[0].type === 'text' ? response.content[0].text : ''

  return NextResponse.json({ email })
}
