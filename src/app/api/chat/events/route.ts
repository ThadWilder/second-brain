export const dynamic = 'force-dynamic'

/**
 * POST /api/chat/events
 *
 * Polling-based bridge between frontend and Managed Agents.
 *
 * Flow:
 *   1. Receive { conversation_id, message }
 *   2. POST user event to session
 *   3. Poll GET /events until session goes idle
 *   4. On tool_use → execute server-side → POST tool_result → resume polling
 *   5. Collect agent text → stream to frontend via SSE
 *   6. Persist messages
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import {
  sendUserMessage,
  sendToolResult,
  getSessionEvents,
  getSessionStatus,
  type SessionEvent,
} from '@/lib/managed-agents'
import { deEscalateTask } from '@/lib/escalation'
import { readWikiPage, getAllWikiPages } from '@/lib/wiki'
import type { SupabaseClient } from '@supabase/supabase-js'

export const maxDuration = 120

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { conversation_id, message } = await req.json()

  if (!conversation_id || !message) {
    return NextResponse.json({ error: 'Missing conversation_id or message' }, { status: 400 })
  }

  const db = getServiceClient()

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
  await db.from('messages').insert({ conversation_id, role: 'user', content: message })
  await db.from('conversations').update({ last_active_at: new Date().toISOString() }).eq('id', conversation_id)

  // Send user message to Managed Agent
  await sendUserMessage(sessionId, message)

  // Build SSE stream
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        let assistantContent = ''
        const processedEventIds = new Set<string>()
        let maxPolls = 60  // 60 * 500ms = 30s max

        // Poll loop
        while (maxPolls-- > 0) {
          // Small delay between polls
          await new Promise((r) => setTimeout(r, 500))

          const events = await getSessionEvents(sessionId)

          for (const event of events) {
            // Skip already-processed events
            if (processedEventIds.has(event.id)) continue
            processedEventIds.add(event.id)

            switch (event.type) {
              case 'agent': {
                // Extract text content
                for (const block of event.content ?? []) {
                  if (block.type === 'text' && block.text) {
                    assistantContent += block.text
                    send('content_delta', { delta: block.text })
                  }
                }
                break
              }

              case 'tool_use': {
                const toolName = event.tool_name!
                const toolInput = event.input ?? {}
                const toolUseId = event.tool_use_id!

                send('tool_use', { tool_name: toolName, tool_use_id: toolUseId })

                // Execute tool server-side
                const result = await executeTool(db, toolName, toolInput)
                send('tool_result', { tool_use_id: toolUseId, result })

                // Submit result back to agent
                await sendToolResult(sessionId, toolUseId, result)
                break
              }

              case 'status_idle': {
                // Agent is done — check if it needs more tool results or is truly finished
                const status = await getSessionStatus(sessionId)
                if (status === 'idle') {
                  // Done — persist and close
                  if (assistantContent) {
                    await db.from('messages').insert({
                      conversation_id,
                      role: 'assistant',
                      content: assistantContent,
                    })
                  }
                  send('message_stop', {})
                  controller.close()
                  return
                }
                break
              }
            }
          }

          // Check if session is idle (no new events)
          if (events.length === 0) {
            const status = await getSessionStatus(sessionId)
            if (status === 'idle') {
              if (assistantContent) {
                await db.from('messages').insert({
                  conversation_id,
                  role: 'assistant',
                  content: assistantContent,
                })
              }
              send('message_stop', {})
              controller.close()
              return
            }
          }
        }

        // Timeout
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

// ─── Wiki tools ───────────────────────────────────────────────────────

async function readWikiTool(db: SupabaseClient, input: { slug: string }) {
  const { found, page, links } = await readWikiPage(db, input.slug)
  if (!found || !page) return { found: false, message: `No wiki page for "${input.slug}".` }
  return { found: true, slug: page.slug, title: page.title, summary: page.summary, content: page.content, source_count: page.source_count, linked_pages: links }
}

async function searchWikiTool(db: SupabaseClient, input: { query: string }) {
  const pages = await getAllWikiPages(db)
  const q = input.query.toLowerCase()
  const matches = pages
    .filter((p) => p.title.toLowerCase().includes(q) || p.summary.toLowerCase().includes(q) || p.slug.includes(q))
    .map((p) => ({ slug: p.slug, title: p.title, summary: p.summary }))
  return { matches, total: matches.length }
}

// ─── Structured data tools ────────────────────────────────────────────

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

async function queryEntries(db: SupabaseClient, input: { source?: string; limit?: number; since?: string }) {
  let query = db.from('entries').select('id, source, raw_text, created_at, source_meta')
    .eq('org_id', ORG_ID).eq('processing_status', 'done')
    .order('created_at', { ascending: false }).limit(input.limit ?? 10)
  if (input.source) query = query.eq('source', input.source)
  if (input.since) query = query.gte('created_at', input.since)
  const { data, error } = await query
  return error ? { error: error.message } : { entries: data }
}

async function queryDecisions(db: SupabaseClient, input: { limit?: number; since?: string }) {
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

async function flagPendingResponse(db: SupabaseClient, input: { summary: string }) {
  const { data: pr, error } = await db.from('pending_responses').insert({ org_id: ORG_ID, summary: input.summary }).select().single()
  return error ? { error: error.message } : { success: true, pending_response_id: pr.id }
}
