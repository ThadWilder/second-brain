/**
 * POST /api/chat/events
 *
 * Bidirectional SSE bridge between the frontend and Managed Agent.
 *
 * Flow:
 *   1. Receive { conversation_id, message } from frontend
 *   2. Look up session_id from conversations table
 *   3. Stream agent events to frontend via SSE
 *   4. On tool_use event: execute tool against Supabase server-side
 *   5. Submit tool result back to agent session
 *   6. Persist user + assistant messages to messages table
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { sendMessageToSession, submitToolResult } from '@/lib/managed-agents'
import { normalize } from '@/lib/entities'
import { deEscalateTask } from '@/lib/escalation'
import type { SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 120  // 2 min max for chat

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { conversation_id, message } = await req.json()

  if (!conversation_id || !message) {
    return NextResponse.json({ error: 'Missing conversation_id or message' }, { status: 400 })
  }

  const db = getServiceClient()

  // Look up session
  const { data: conv, error: convError } = await db
    .from('conversations')
    .select('managed_agent_session_id')
    .eq('id', conversation_id)
    .single()

  if (convError || !conv?.managed_agent_session_id) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  const sessionId = conv.managed_agent_session_id

  // Persist user message
  await db.from('messages').insert({
    conversation_id,
    role: 'user',
    content: message,
  })

  // Update conversation last_active_at
  await db
    .from('conversations')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', conversation_id)

  // Build SSE stream
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        )
      }

      try {
        let assistantContent = ''

        // ── Stream from Managed Agent ────────────────────────────────
        const agentStream = await sendMessageToSession(sessionId, message)

        for await (const event of agentStream) {
          if (event.type === 'content_block_delta') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const delta = (event as any).delta?.text ?? ''
            assistantContent += delta
            send('content_delta', { delta })
          } else if (event.type === 'content_block_start') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const block = (event as any).content_block
            if (block?.type === 'tool_use') {
              send('tool_use', {
                tool_name: block.name,
                tool_use_id: block.id,
                tool_input: block.input,
              })

              // Execute tool server-side
              const toolResult = await executeTool(db, block.name, block.input)
              send('tool_result', { tool_use_id: block.id, result: toolResult })

              // Submit result back to agent
              const continueStream = await submitToolResult(sessionId, block.id, toolResult)
              for await (const contEvent of continueStream) {
                if (contEvent.type === 'content_block_delta') {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const delta = (contEvent as any).delta?.text ?? ''
                  assistantContent += delta
                  send('content_delta', { delta })
                }
              }
            }
          } else if (event.type === 'message_stop') {
            // Persist assistant message
            await db.from('messages').insert({
              conversation_id,
              role: 'assistant',
              content: assistantContent,
            })
            send('message_stop', {})
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        send('error', { message })
      } finally {
        controller.close()
      }
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

// ─────────────────────────────────────────
// Tool executor — called when agent emits tool_use
// ─────────────────────────────────────────
async function executeTool(
  db: SupabaseClient,
  toolName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: any
): Promise<unknown> {
  switch (toolName) {
    case 'query_tasks':
      return queryTasks(db, input)
    case 'query_entries':
      return queryEntries(db, input)
    case 'query_entities':
      return queryEntities(db, input)
    case 'query_decisions':
      return queryDecisions(db, input)
    case 'update_task':
      return updateTask(db, input)
    case 'create_task':
      return createTask(db, input)
    case 'log_decision':
      return logDecision(db, input)
    case 'flag_pending_response':
      return flagPendingResponse(db, input)
    default:
      return { error: `Unknown tool: ${toolName}` }
  }
}

async function queryTasks(db: SupabaseClient, input: {
  brand_name?: string
  status?: string
  escalation?: boolean
  due_before?: string
  assigned_to?: string
  limit?: number
}) {
  let query = db
    .from('tasks')
    .select(`
      *,
      task_entities(role, entities(id, name, type))
    `)
    .eq('org_id', ORG_ID)
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 20)

  if (input.status) query = query.eq('status', input.status)
  if (input.escalation !== undefined) query = query.eq('escalation', input.escalation)
  if (input.due_before) query = query.lt('due_date', input.due_before)

  if (input.brand_name) {
    // Filter by brand via task_entities join
    const { data: brand } = await db
      .from('entities')
      .select('id')
      .eq('org_id', ORG_ID)
      .ilike('name', `%${input.brand_name}%`)
      .eq('type', 'brand')
      .single()

    if (brand) {
      const { data: taskIds } = await db
        .from('task_entities')
        .select('task_id')
        .eq('entity_id', brand.id)
        .eq('role', 'brand')

      if (taskIds?.length) {
        query = query.in('id', taskIds.map((t) => t.task_id))
      }
    }
  }

  const { data, error } = await query
  if (error) return { error: error.message }
  return { tasks: data, count: data?.length ?? 0 }
}

async function queryEntries(db: SupabaseClient, input: {
  brand_name?: string
  source?: string
  limit?: number
  since?: string
}) {
  let query = db
    .from('entries')
    .select('id, source, raw_text, created_at, source_meta')
    .eq('org_id', ORG_ID)
    .eq('processing_status', 'done')
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 10)

  if (input.source) query = query.eq('source', input.source)
  if (input.since) query = query.gte('created_at', input.since)

  const { data, error } = await query
  if (error) return { error: error.message }
  return { entries: data }
}

async function queryEntities(db: SupabaseClient, input: {
  type?: string
  name?: string
}) {
  let query = db
    .from('entities')
    .select('*')
    .eq('org_id', ORG_ID)
    .order('name')

  if (input.type) query = query.eq('type', input.type)
  if (input.name) query = query.ilike('name', `%${input.name}%`)

  const { data, error } = await query
  if (error) return { error: error.message }
  return { entities: data }
}

async function queryDecisions(db: SupabaseClient, input: {
  brand_name?: string
  limit?: number
  since?: string
}) {
  let query = db
    .from('decisions')
    .select(`
      *,
      decision_entities(role, entities(name))
    `)
    .eq('org_id', ORG_ID)
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 10)

  if (input.since) query = query.gte('created_at', input.since)

  const { data, error } = await query
  if (error) return { error: error.message }
  return { decisions: data }
}

async function updateTask(db: SupabaseClient, input: {
  id: string
  status?: string
  due_date?: string
  description?: string
  waiting_on?: string
}) {
  const updates: Record<string, unknown> = {}
  const { id, ...changes } = input

  let prevStatus: string | null = null

  if (changes.status) {
    const { data: current } = await db.from('tasks').select('status, escalation').eq('id', id).single()
    prevStatus = current?.status ?? null
    updates.status = changes.status
    if (changes.status === 'done') {
      updates.resolved_at = new Date().toISOString()
    }
  }
  if (changes.due_date !== undefined) updates.due_date = changes.due_date
  if (changes.description) updates.description = changes.description
  if (changes.waiting_on !== undefined) updates.waiting_on = changes.waiting_on

  const { error } = await db.from('tasks').update(updates).eq('id', id)
  if (error) return { error: error.message }

  // Log task_event
  if (changes.status && prevStatus !== changes.status) {
    await db.from('task_events').insert({
      task_id: id,
      event_type: 'status_change',
      metadata: { from: prevStatus, to: changes.status },
    })
    // Auto de-escalate when done
    if (changes.status === 'done') {
      await deEscalateTask(db, id, 'task_done')
    }
  }
  if (changes.due_date) {
    await db.from('task_events').insert({
      task_id: id,
      event_type: 'due_date_changed',
      metadata: { new_date: changes.due_date },
    })
  }

  return { success: true, task_id: id }
}

async function createTask(db: SupabaseClient, input: {
  description: string
  brand_name?: string
  due_date?: string
  waiting_on?: string
}) {
  const { data: task, error } = await db
    .from('tasks')
    .insert({
      org_id: ORG_ID,
      description: input.description,
      due_date: input.due_date ?? null,
      waiting_on: input.waiting_on ?? null,
    })
    .select()
    .single()

  if (error) return { error: error.message }

  // Log created event
  await db.from('task_events').insert({
    task_id: task.id,
    event_type: 'created',
    metadata: { source: 'chat' },
  })

  // Link to brand
  if (input.brand_name) {
    const { data: brand } = await db
      .from('entities')
      .select('id')
      .eq('org_id', ORG_ID)
      .ilike('name', `%${input.brand_name}%`)
      .eq('type', 'brand')
      .single()

    if (brand) {
      await db.from('task_entities').insert({
        task_id: task.id,
        entity_id: brand.id,
        role: 'brand',
      })
    }
  }

  return { success: true, task_id: task.id, task }
}

async function logDecision(db: SupabaseClient, input: {
  summary: string
  brand_name?: string
  made_by?: string
}) {
  const { data: decision, error } = await db
    .from('decisions')
    .insert({
      org_id: ORG_ID,
      summary: input.summary,
      made_by: input.made_by ?? null,
    })
    .select()
    .single()

  if (error) return { error: error.message }

  if (input.brand_name) {
    const { data: brand } = await db
      .from('entities')
      .select('id')
      .eq('org_id', ORG_ID)
      .ilike('name', `%${input.brand_name}%`)
      .eq('type', 'brand')
      .single()

    if (brand) {
      await db.from('decision_entities').insert({
        decision_id: decision.id,
        entity_id: brand.id,
        role: 'brand',
      })
    }
  }

  return { success: true, decision_id: decision.id }
}

async function flagPendingResponse(db: SupabaseClient, input: {
  summary: string
  brand_name?: string
}) {
  const { data: pr, error } = await db
    .from('pending_responses')
    .insert({
      org_id: ORG_ID,
      summary: input.summary,
    })
    .select()
    .single()

  if (error) return { error: error.message }
  return { success: true, pending_response_id: pr.id }
}
