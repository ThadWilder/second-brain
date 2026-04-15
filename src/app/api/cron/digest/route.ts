export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/digest
 *
 * Weekly digest — Sundays at 8pm.
 * Reviews the week's activity across all brands.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { anthropic, CLAUDE_MODEL_DEEP } from '@/lib/claude'
import { sendBriefingEmail } from '@/lib/postmark'
import { markdownToHtml } from '@/lib/email-html'
import { format, startOfWeek, endOfWeek } from 'date-fns'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
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
      model: CLAUDE_MODEL_DEEP,
      max_tokens: 2048,
      system: `You write weekly strategic digest emails for a marketing agency VP. You are thoughtful and analytical — don't just list numbers, interpret them.

Format:
---
## This Week at a Glance
CLOSED: X tasks across X brands | OPENED: X new | OVERDUE: X

## What Got Done
[Group closed tasks by brand. Call out anything notable — big wins, long-standing items finally resolved.]

## What's Stuck
[Overdue items and stalled brands. Be specific about what's blocking progress and how long it's been.]

## Decisions Made
[List decisions with context on why they matter.]

## Patterns & Observations
[This is where you earn your keep. Look for:
- Brands getting disproportionate attention vs. neglected ones
- Recurring themes (e.g., GBP issues across multiple brands)
- Velocity trends (are we closing faster or slower than opening?)
- People or vendors who keep appearing in blockers]

## Recommendation for Next Week
[2-3 specific things to prioritize based on the data. Be opinionated.]
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

    await sendBriefingEmail({
      subject,
      htmlBody: markdownToHtml(digestText),
      textBody: digestText,
    })

    return NextResponse.json({ success: true, week: digestData.week })
  } catch (err) {
    console.error('Digest cron error:', err)
    return NextResponse.json(
      { error: 'Digest failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
