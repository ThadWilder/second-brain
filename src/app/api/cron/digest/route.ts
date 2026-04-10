export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/cron/digest
 *
 * Weekly digest — Sundays at 8pm.
 * Reviews the week's activity across all brands.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { anthropic, CLAUDE_MODEL } from '@/lib/claude'
import { sendBriefingEmail } from '@/lib/postmark'
import { format, startOfWeek, endOfWeek } from 'date-fns'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getServiceClient()

  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }).toISOString()
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 }).toISOString()

  // Tasks closed this week
  const { data: closedTasks } = await db
    .from('tasks')
    .select(`
      id, description, resolved_at,
      task_entities(role, entities(name))
    `)
    .eq('org_id', ORG_ID)
    .eq('status', 'done')
    .gte('resolved_at', weekStart)
    .lte('resolved_at', weekEnd)

  // Tasks opened this week
  const { count: openedCount } = await db
    .from('tasks')
    .select('id', { count: 'exact' })
    .eq('org_id', ORG_ID)
    .gte('created_at', weekStart)
    .lte('created_at', weekEnd)

  // Overdue tasks
  const today = now.toISOString().slice(0, 10)
  const { data: overdueTasks } = await db
    .from('tasks')
    .select(`
      description,
      task_entities(role, entities(name))
    `)
    .eq('org_id', ORG_ID)
    .eq('status', 'open')
    .lt('due_date', today)
    .not('due_date', 'is', null)

  // Brand activity this week
  const { data: brandActivity } = await db
    .from('task_entities')
    .select('entity_id, entities(name, type), tasks(id, created_at)')
    .eq('role', 'brand')
    .gte('tasks.created_at', weekStart)
    .lte('tasks.created_at', weekEnd)

  // Decisions this week
  const { data: weekDecisions } = await db
    .from('decisions')
    .select(`
      summary, made_by,
      decision_entities(role, entities(name))
    `)
    .eq('org_id', ORG_ID)
    .gte('created_at', weekStart)
    .lte('created_at', weekEnd)

  const digestData = {
    week: `${format(new Date(weekStart), 'MMM d')}–${format(new Date(weekEnd), 'MMM d, yyyy')}`,
    closed_tasks: closedTasks?.length ?? 0,
    opened_tasks: openedCount ?? 0,
    overdue_count: overdueTasks?.length ?? 0,
    overdue_brands: Array.from(new Set(
      (overdueTasks ?? []).flatMap((t) =>
        (t.task_entities as unknown as Array<{ role: string; entities: { name: string } }>)
          ?.filter((te) => te.role === 'brand')
          .map((te) => te.entities?.name)
          .filter(Boolean)
      )
    )),
    decisions: weekDecisions?.map((d) => d.summary) ?? [],
    closed_by_brand: (closedTasks ?? []).reduce((acc, t) => {
      const brand = (t.task_entities as unknown as Array<{ role: string; entities: { name: string } }>)
        ?.find((te) => te.role === 'brand')?.entities?.name ?? 'Unknown'
      acc[brand] = (acc[brand] ?? 0) + 1
      return acc
    }, {} as Record<string, number>),
  }

  const claudeResponse = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: `You write weekly digest emails for a marketing agency operator. Be concise and direct.
Format:
---
CLOSED: X tasks across X brands
OPENED: X new tasks
OVERDUE: X ([brand list])

CLOSED BY BRAND:
• [brand]: X closed

DECISIONS MADE: X
• [summary per decision]

[One sentence each on: top brand by activity, any stalled brand]
---`,
    messages: [
      {
        role: 'user',
        content: `Write the weekly digest for ${digestData.week}.\n\nData:\n${JSON.stringify(digestData, null, 2)}`,
      },
    ],
  })

  const digestText =
    claudeResponse.content[0].type === 'text' ? claudeResponse.content[0].text : ''

  const subject = `Week in review — ${digestData.week}`

  const escapedText = digestText
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  await sendBriefingEmail({
    subject,
    htmlBody: `<pre style="font-family: monospace; font-size: 14px; white-space: pre-wrap;">${escapedText}</pre>`,
    textBody: digestText,
  })

  return NextResponse.json({ success: true, week: digestData.week })
}
