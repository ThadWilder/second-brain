/**
 * POST /api/chat/events
 *
 * SSE bridge between the frontend and Managed Agents.
 *
 * Flow:
 *   1. Receive { conversation_id, message }
 *   2. Look up session_id from conversations table
 *   3. POST user.message to session
 *   4. Open SSE stream from session, pipe to frontend
 *   5. On agent.custom_tool_use → execute tool → POST custom_tool_result
 *   6. Persist messages
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { sendUserMessage, sendToolResult, openSessionStream } from '@/lib/managed-agents'
import { deEscalateTask } from '@/lib/escalation'
import { readWikiPage, getAllWikiPages } from '@/lib/wiki'
import type { SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

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

  // Persist user message locally
  await db.from('messages').insert({ conversation_id, role: 'user', content: message })
  await db.from('conversations').update({ last_active_at: new Date().toISOString() }).eq('id', conversation_id)

  // Send user message to Managed Agent session
  await sendUserMessage(sessionId, message)

  // Build SSE stream that bridges the Managed Agent event stream to the frontend
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        let assistantContent = ''

        // Agentic loop — continues until end_turn
        let continueLoop = true

        while (continueLoop) {
          const agentResponse = await openSessionStream(sessionId)
          const reader = agentResponse.body!.getReader()
          const decoder = new TextDecoder()
          let buffer = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              let event: Record<string, unknown>
              try { event = JSON.parse(line.slice(6)) } catch { continue }

              await handleSessionEvent(event, {
                db,
                sessionId,
                send,
                assistantContentRef: { value: assistantContent },
                onContent: (delta: string) => { assistantContent += delta },
              })

              // Check if session is idle
              if (event.type === 'session.status_idle') {
                const stopReason = event.stop_reason as Record<string, unknown> | undefined
                if (stopReason?.type === 'end_turn') {
                  continueLoop = false
                } else if (stopReason?.type === 'requires_action') {
                  // Tool results were submitted inside handleSessionEvent, loop again
                }
              }
            }
          }
        }

        // Persist final assistant message
        if (assistantContent) {
          await db.from('messages').insert({ conversation_id, role: 'assistant', content: assistantContent })
        }

        send('message_stop', {})
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        send('error', { message: msg })
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
// Session event handler
// ─────────────────────────────────────────

interface HandlerContext {
  db: SupabaseClient
  sessionId: string
  send: (event: string, data: unknown) => void
  assistantContentRef: { value: string }
  onContent: (delta: string) => void
}

async function handleSessionEvent(
  event: Record<string, unknown>,
  ctx: HandlerContext
): Promise<void> {
  const { db, sessionId, send, onContent } = ctx

  switch (event.type) {
    case 'agent.message_delta': {
      // Text content from the agent
      const delta = (event.delta as Record<string, unknown>)?.text as string | undefined
      if (delta) {
        onContent(delta)
        send('content_delta', { delta })
      }
      break
    }

    case 'agent.custom_tool_use': {
      // Agent wants us to execute a custom tool
      const toolUseId = event.id as string
      const toolName = event.name as string
      const toolInput = event.input ?? {}

      send('tool_use', { tool_name: toolName, tool_use_id: toolUseId })

      const result = await executeTool(db, toolName, toolInput)
      send('tool_result', { tool_use_id: toolUseId, result })

      // Submit result back to session
      await sendToolResult(sessionId, toolUseId, result)
      break
    }

    case 'session.status_idle':
      // Handled in the loop above
      break

    case 'agent.error': {
      send('error', { message: (event.message as string) ?? 'Agent error' })
      break
    }
  }
}

// ─────────────────────────────────────────
// Tool executor
// ─────────────────────────────────────────

async function executeTool(
  db: SupabaseClient,
  toolName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: any
): Promise<unknown> {
  switch (toolName) {
    case 'read_wiki':     return readWikiTool(db, input)
    case 'search_wiki':   return searchWikiTool(db, input)
    case 'query_tasks':   return queryTasks(db, input)
    case 'query_entries': return queryEntries(db, input)
    case 'query_decisions': return queryDecisions(db, input)
    case 'update_task':   return updateTask(db, input)
    case 'create_task':   return createTask(db, input)
    case 'log_decision':  return logDecision(db, input)
    case 'flag_pending_response': return flagPendingResponse(db, input)
    default: return { error: `Unknown tool: ${toolName}` }
  }
}

// ─────────────────────────────────────────
// Wiki tools
// ─────────────────────────────────────────

async function readWikiTool(db: SupabaseClient, input: { slug: string }) {
  const { found, page, links } = await readWikiPage(db, input.slug)
  if (!found || !page) {
    return { found: false, message: `No wiki page for slug "${input.slug}". Try search_wiki.` }
  }
  return { found: true, slug: page.slug, title: page.title, summary: page.summary, content: page.content, source_count: page.source_count, updated_at: page.updated_at, linked_pages: links }
}

async function searchWikiTool(db: SupabaseClient, input: { query: string }) {
  const pages = await getAllWikiPages(db)
  const q = input.query.toLowerCase()
  const matches = pages
    .filter((p) => p.title.toLowerCase().includes(q) || p.summary.toLowerCase().includes(q) || p.slug.includes(q))
    .map((p) => ({ slug: p.slug, title: p.title, summary: p.summary, source_count: p.source_count }))
  return { query: input.query, matches, total: matches.length, hint: matches[0] ? `Call read_wiki with slug "${matches[0].slug}"` : 'No matches.' }
}

// ─────────────────────────────────────────
// Structured data tools
// ─────────────────────────────────────────

async function queryTasks(db: SupabaseClient, input: {
  brand_name?: string; status?: string; escalation?: boolean; due_before?: string; limit?: number
}) {
  let query = db.from('tasks').select('*, task_entities(role, entities(id, name, type))')
    .eq('org_id', ORG_ID).order('created_at', { ascending: false }).limit(input.limit ?? 20)
  if (input.status) query = query.eq('status', input.status)
  if (input.escalation !== undefined) query = query.eq('escalation', input.escalation)
  if (input.due_before) query = query.lt('due_date', input.due_before)
  if (input.brand_name) {
    const { data: brand } = await db.from('entities').select('id').eq('org_id', ORG_ID).ilike('name', `%${input.brand_name}%`).eq('type', 'brand').single()
    if (brand) {
      const { data: ids } = await db.from('task_entities').select('task_id').eq('entity_id', brand.id).eq('role', 'brand')
      if (ids?.length) query = query.in('id', ids.map((t) => t.task_id))
    }
  }
  const { data, error } = await query
  return error ? { error: error.message } : { tasks: data, count: data?.length ?? 0 }
}

async function queryEntries(db: SupabaseClient, input: { brand_name?: string; source?: string; limit?: number; since?: string }) {
  let query = db.from('entries').select('id, source, raw_text, created_at, source_meta')
    .eq('org_id', ORG_ID).eq('processing_status', 'done')
    .order('created_at', { ascending: false }).limit(input.limit ?? 10)
  if (input.source) query = query.eq('source', input.source)
  if (input.since) query = query.gte('created_at', input.since)
  const { data, error } = await query
  return error ? { error: error.message } : { entries: data }
}

async function queryDecisions(db: SupabaseClient, input: { brand_name?: string; limit?: number; since?: string }) {
  let query = db.from('decisions').select('*, decision_entities(role, entities(name))')
    .eq('org_id', ORG_ID).order('created_at', { ascending: false }).limit(input.limit ?? 10)
  if (input.since) query = query.gte('created_at', input.since)
  const { data, error } = await query
  return error ? { error: error.message } : { decisions: data }
}

async function updateTask(db: SupabaseClient, input: { id: string; status?: string; due_date?: string; description?: string; waiting_on?: string }) {
  const { id, ...changes } = input
  const updates: Record<string, unknown> = {}
  let prevStatus: string | null = null
  if (changes.status) {
    const { data: cur } = await db.from('tasks').select('status').eq('id', id).single()
    prevStatus = cur?.status ?? null
    updates.status = changes.status
    if (changes.status === 'done') updates.resolved_at = new Date().toISOString()
  }
  if (changes.due_date !== undefined) updates.due_date = changes.due_date
  if (changes.description) updates.description = changes.description
  if (changes.waiting_on !== undefined) updates.waiting_on = changes.waiting_on
  const { error } = await db.from('tasks').update(updates).eq('id', id)
  if (error) return { error: error.message }
  if (changes.status && prevStatus !== changes.status) {
    await db.from('task_events').insert({ task_id: id, event_type: 'status_change', metadata: { from: prevStatus, to: changes.status } })
    if (changes.status === 'done') await deEscalateTask(db, id, 'task_done')
  }
  return { success: true, task_id: id }
}

async function createTask(db: SupabaseClient, input: { description: string; brand_name?: string; due_date?: string; waiting_on?: string }) {
  const { data: task, error } = await db.from('tasks')
    .insert({ org_id: ORG_ID, description: input.description, due_date: input.due_date ?? null, waiting_on: input.waiting_on ?? null })
    .select().single()
  if (error) return { error: error.message }
  await db.from('task_events').insert({ task_id: task.id, event_type: 'created', metadata: { source: 'chat' } })
  if (input.brand_name) {
    const { data: brand } = await db.from('entities').select('id').eq('org_id', ORG_ID).ilike('name', `%${input.brand_name}%`).eq('type', 'brand').single()
    if (brand) await db.from('task_entities').insert({ task_id: task.id, entity_id: brand.id, role: 'brand' })
  }
  return { success: true, task_id: task.id }
}

async function logDecision(db: SupabaseClient, input: { summary: string; brand_name?: string; made_by?: string }) {
  const { data: decision, error } = await db.from('decisions')
    .insert({ org_id: ORG_ID, summary: input.summary, made_by: input.made_by ?? null }).select().single()
  if (error) return { error: error.message }
  if (input.brand_name) {
    const { data: brand } = await db.from('entities').select('id').eq('org_id', ORG_ID).ilike('name', `%${input.brand_name}%`).eq('type', 'brand').single()
    if (brand) await db.from('decision_entities').insert({ decision_id: decision.id, entity_id: brand.id, role: 'brand' })
  }
  return { success: true, decision_id: decision.id }
}

async function flagPendingResponse(db: SupabaseClient, input: { summary: string; brand_name?: string }) {
  const { data: pr, error } = await db.from('pending_responses').insert({ org_id: ORG_ID, summary: input.summary }).select().single()
  return error ? { error: error.message } : { success: true, pending_response_id: pr.id }
}
