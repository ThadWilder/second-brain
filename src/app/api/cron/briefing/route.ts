export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/cron/briefing
 *
 * Morning briefing — daily at 7am.
 * Called by external cron (Vercel Cron, Render, etc.)
 * Protected by CRON_SECRET in Authorization header.
 *
 * Uses direct Claude API (not Managed Agents) — simple query + summarize + send.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { anthropic, CLAUDE_MODEL } from '@/lib/claude'
import { sendBriefingEmail } from '@/lib/postmark'
import { runEscalationPass, getEscalationContext } from '@/lib/escalation'
import { format } from 'date-fns'

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Auth check — also reject if CRON_SECRET is not configured
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
  const db = getServiceClient()

  // Run escalation pass to keep flags fresh
  await runEscalationPass(db)

  // Gather data
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString()

  // Open tasks
  const { data: openTasks } = await db
    .from('tasks')
    .select(`
      id, description, due_date, escalation, waiting_on,
      task_entities(role, entities(name))
    `)
    .eq('org_id', ORG_ID)
    .eq('status', 'open')
    .order('escalation', { ascending: false })
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(50)

  // Escalation context
  const { escalations, needsResponse } = await getEscalationContext(db)

  // New entries since yesterday
  const { count: newEntries } = await db
    .from('entries')
    .select('id', { count: 'exact' })
    .eq('org_id', ORG_ID)
    .gte('created_at', yesterday)

  // Pending responses
  const { data: pendingResponses } = await db
    .from('pending_responses')
    .select('summary')
    .eq('org_id', ORG_ID)
    .eq('responded', false)
    .order('created_at', { ascending: true })
    .limit(10)

  // Tasks due today
  const todayTasks = (openTasks ?? []).filter(
    (t) => t.due_date === todayStr
  )

  // Build structured data for Claude
  const briefingData = {
    date: format(today, 'EEEE, MMMM d'),
    escalations,
    needs_response: needsResponse,
    new_entries_since_yesterday: newEntries ?? 0,
    pending_responses: pendingResponses?.map((p) => p.summary) ?? [],
    todays_tasks: todayTasks.map((t) => ({
      description: t.description,
      brand: (t.task_entities as unknown as Array<{ role: string; entities: { name: string } }>)
        ?.find((te) => te.role === 'brand')?.entities?.name ?? 'Unknown',
      due_date: t.due_date,
    })),
    open_task_count: openTasks?.length ?? 0,
    escalation_count: escalations.length,
  }

  // Single Claude API call to generate natural language briefing
  const claudeResponse = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: `You generate the Dim Sum — the daily briefing for a marketing agency operator.
Format the briefing as plain text email body. Use the template below.
Be direct. Use bullet points. No fluff.

TEMPLATE:
---
ESCALATIONS (list each as "• [brand]: [task]")

NEEDS RESPONSE (list each as "• [summary] (Xh old)")

NEW SINCE YESTERDAY
• X dumplings processed, X pending responses

TODAY'S TASKS (list each as "• [task] — [brand]")

Total open: X tasks
---`,
    messages: [
      {
        role: 'user',
        content: `Generate the Dim Sum briefing for ${briefingData.date}.\n\nData:\n${JSON.stringify(briefingData, null, 2)}`,
      },
    ],
  })

  const briefingText =
    claudeResponse.content[0].type === 'text' ? claudeResponse.content[0].text : ''

  const subject = `🍜 Your Dim Sum — ${briefingData.date} — ${briefingData.escalation_count} escalations, ${briefingData.open_task_count} open tasks`

  const escapedText = briefingText
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const htmlBody = `<pre style="font-family: monospace; font-size: 14px; white-space: pre-wrap;">${escapedText}</pre>
<p style="font-size: 12px; color: #666;">Reply to this email to update anything.</p>`

  await sendBriefingEmail({
    subject,
    htmlBody,
    textBody: `${briefingText}\n\nReply to this email to update anything.`,
  })

  return NextResponse.json({
    success: true,
    escalations: briefingData.escalation_count,
    open_tasks: briefingData.open_task_count,
  })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    console.error('[cron/briefing] Failed:', message, stack)
    return NextResponse.json(
      { error: 'Briefing cron failed', details: message },
      { status: 500 }
    )
  }
}
