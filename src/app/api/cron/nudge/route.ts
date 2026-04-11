export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/cron/nudge
 *
 * Afternoon nudge — daily at 2pm.
 * Only fires if stale tasks exist.
 * Top 3-5 by priority. Reply goes to ingest pipeline.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { anthropic, CLAUDE_MODEL } from '@/lib/claude'
import { sendNudgeEmail } from '@/lib/postmark'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const db = getServiceClient()

    // Find stale open tasks (no update in 24h)
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: staleTasks } = await db
      .from('tasks')
      .select(`
        id, description, due_date, escalation, waiting_on,
        task_entities(role, entities(name))
      `)
      .eq('org_id', ORG_ID)
      .eq('status', 'open')
      .lt('updated_at', cutoff)
      .order('escalation', { ascending: false })
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(5)

    if (!staleTasks?.length) {
      return NextResponse.json({ success: true, sent: false, reason: 'No stale tasks' })
    }

    const taskList = staleTasks.map((t) => ({
      id: t.id,
      description: t.description,
      brand: (t.task_entities as unknown as Array<{ role: string; entities: { name: string } }>)
        ?.find((te) => te.role === 'brand')?.entities?.name ?? 'Unknown',
      due_date: t.due_date,
      escalation: t.escalation,
      waiting_on: t.waiting_on,
    }))

    // Generate nudge text via Claude
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 512,
      system: 'You write brief, direct follow-up nudge emails. List tasks. Be concise. No filler.',
      messages: [
        {
          role: 'user',
          content: `Write a nudge email for these stale tasks:\n${JSON.stringify(taskList, null, 2)}\n\nEnd with: "Reply to this email with any updates."`,
        },
      ],
    })

    const nudgeText =
      response.content[0].type === 'text' ? response.content[0].text : ''

    const subject = `Follow up needed — ${staleTasks.length} open dumplings`
    const escapedText = nudgeText
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const htmlBody = `<pre style="font-family: monospace; font-size: 14px; white-space: pre-wrap;">${escapedText}</pre>`

    const messageId = await sendNudgeEmail({
      subject,
      htmlBody,
      textBody: nudgeText,
    })

    // Record the nudge message
    const { data: nudgeMessage } = await db
      .from('nudge_messages')
      .insert({
        org_id: ORG_ID,
        channel: 'email',
        postmark_message_id: messageId,
      })
      .select()
      .single()

    // Link tasks to this nudge
    if (nudgeMessage) {
      await db.from('nudge_message_tasks').insert(
        staleTasks.map((t) => ({
          nudge_message_id: nudgeMessage.id,
          task_id: t.id,
        }))
      )

      // Log nudged event for each task
      await db.from('task_events').insert(
        staleTasks.map((t) => ({
          task_id: t.id,
          event_type: 'nudged',
          metadata: { nudge_message_id: nudgeMessage.id },
        }))
      )
    }

    return NextResponse.json({
      success: true,
      sent: true,
      task_count: staleTasks.length,
      postmark_message_id: messageId,
    })
  } catch (err) {
    console.error('Nudge cron error:', err)
    return NextResponse.json(
      { error: 'Nudge failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
