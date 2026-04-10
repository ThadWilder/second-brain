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
  const { conversation_id, message, attachments } = await req.json()

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

  // Send user message to Managed Agent (with optional image attachments)
  const imageUrls = (attachments ?? [])
    .filter((a: { type: string }) => a.type.startsWith('image/'))
    .map((a: { url: string; filename: string }) => ({ url: a.url, filename: a.filename }))
  await sendUserMessage(sessionId, message, imageUrls.length > 0 ? imageUrls : undefined)

  // Build SSE stream
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      const send = (event: string, data: unknown) => {
        if (closed) return
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      const safeClose = () => {
        if (!closed) { closed = true; controller.close() }
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

                // Submit result back to agent — then wait for it to process
                await sendToolResult(sessionId, toolUseId, result)
                // Give agent time to start running with the result
                await new Promise((r) => setTimeout(r, 1500))
                break
              }

              case 'status_idle': {
                // Don't stop immediately — there might be more events coming
                // after tool results. Just note it and let the outer loop check.
                break
              }
            }
          }

          // After processing all new events, check if we're done.
          // Count how many status_idle events we've seen — we need to see idle
          // AFTER agent text has been produced (not just after tool_use).
          const idleCount = Array.from(processedEventIds).filter(id => {
            const evt = events.find(e => e.id === id)
            return evt?.type === 'status_idle'
          }).length

          // Only check for done if we've seen at least one agent text event
          // or we've polled many times with no new events
          const hasAgentText = assistantContent.length > 0
          const status = await getSessionStatus(sessionId)

          if (status === 'idle' && (hasAgentText || maxPolls < 50)) {
            // One final poll to be sure
            await new Promise((r) => setTimeout(r, 800))
            const finalEvents = await getSessionEvents(sessionId)
            for (const event of finalEvents) {
              if (processedEventIds.has(event.id)) continue
              processedEventIds.add(event.id)
              if (event.type === 'agent') {
                for (const block of event.content ?? []) {
                  if (block.type === 'text' && block.text) {
                    assistantContent += block.text
                    send('content_delta', { delta: block.text })
                  }
                }
              }
            }

            if (assistantContent) {
              await db.from('messages').insert({
                conversation_id,
                role: 'assistant',
                content: assistantContent,
              })
            }
            send('message_stop', {})
            safeClose()
            return
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
        safeClose()
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
    case 'assign_entity_to_task': return assignEntityToTask(db, input)
    case 'add_note_to_task': return addNoteToTask(db, input)
    case 'close_tasks_for_brand': return closeTasksForBrand(db, input)
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

// ─── Entity resolution helper ────────────────────────────────────────

/**
 * Resolve an entity name to an ID. Checks normalized_name first, then
 * entity_aliases.normalized_alias. Returns { id, name } or null.
 */
async function resolveEntityByName(db: SupabaseClient, name: string, type?: string) {
  const normalized = name.toLowerCase().trim().replace(/\s+/g, ' ')

  // 1. Exact match on normalized_name
  let query = db.from('entities').select('id, name').eq('org_id', ORG_ID).eq('normalized_name', normalized)
  if (type) query = query.eq('type', type)
  const { data: exact } = await query.limit(1).single()
  if (exact) return exact

  // 2. Cross-type match (no type filter)
  if (type) {
    const { data: crossType } = await db.from('entities').select('id, name').eq('org_id', ORG_ID).eq('normalized_name', normalized).limit(1).single()
    if (crossType) return crossType
  }

  // 3. Alias lookup
  const { data: alias } = await db.from('entity_aliases').select('entity_id').eq('normalized_alias', normalized).limit(1).single()
  if (alias) {
    const { data: entity } = await db.from('entities').select('id, name').eq('id', alias.entity_id).single()
    if (entity) return entity
  }

  // 4. ILIKE fallback for partial matches
  const safeName = name.replace(/[%_\\]/g, '\\$&')
  let ilikeQuery = db.from('entities').select('id, name').eq('org_id', ORG_ID).ilike('name', `%${safeName}%`)
  if (type) ilikeQuery = ilikeQuery.eq('type', type)
  const { data: fuzzy } = await ilikeQuery.limit(1).single()
  if (fuzzy) return fuzzy

  return null
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
    // Escape ILIKE special characters to prevent pattern injection
    const safeName = input.brand_name.replace(/[%_\\]/g, '\\$&')
    const { data: brand } = await db.from('entities').select('id').eq('org_id', ORG_ID).ilike('name', `%${safeName}%`).eq('type', 'brand').single()
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

async function updateTask(db: SupabaseClient, input: { task_id?: string; id?: string; status?: string; escalation?: boolean; due_date?: string | null; description?: string; waiting_on?: string | null }) {
  const taskId = input.task_id ?? input.id
  if (!taskId) return { error: 'task_id is required' }

  try {
    const { data: cur } = await db.from('tasks').select('status, escalation, due_date, description').eq('id', taskId).single()
    if (!cur) return { error: `Task ${taskId} not found` }

    const updates: Record<string, unknown> = {}
    const events: Array<{ task_id: string; event_type: string; metadata: Record<string, unknown> }> = []

    // Status change
    if (input.status && input.status !== cur.status) {
      // Map 'closed' to 'done' for DB compatibility
      const dbStatus = input.status === 'closed' ? 'done' : input.status
      updates.status = dbStatus
      if (dbStatus === 'done') updates.resolved_at = new Date().toISOString()
      events.push({ task_id: taskId, event_type: 'status_change', metadata: { from: cur.status, to: dbStatus } })
    }

    // Escalation change
    if (input.escalation !== undefined && input.escalation !== cur.escalation) {
      updates.escalation = input.escalation
      events.push({ task_id: taskId, event_type: input.escalation ? 'escalated' : 'de_escalated', metadata: { source: 'chat' } })
    }

    // Due date change
    if (input.due_date !== undefined && input.due_date !== cur.due_date) {
      updates.due_date = input.due_date
      events.push({ task_id: taskId, event_type: 'due_date_changed', metadata: { from: cur.due_date, to: input.due_date } })
    }

    if (input.description) updates.description = input.description
    if (input.waiting_on !== undefined) updates.waiting_on = input.waiting_on

    if (Object.keys(updates).length === 0) return { success: true, task_id: taskId, message: 'No changes needed' }

    const { error } = await db.from('tasks').update(updates).eq('id', taskId)
    if (error) return { error: error.message }

    if (events.length > 0) await db.from('task_events').insert(events)

    // De-escalate if done
    const newStatus = updates.status as string | undefined
    if (newStatus === 'done') await deEscalateTask(db, taskId, 'task_done')

    const changeList = Object.keys(updates).join(', ')
    return { success: true, task_id: taskId, message: `Updated ${changeList} on task ${taskId}.` }
  } catch (err) {
    return { error: `Failed to update task: ${err instanceof Error ? err.message : String(err)}` }
  }
}

async function createTask(db: SupabaseClient, input: { description: string; brand_name?: string; assignee_name?: string; due_date?: string; escalation?: boolean }) {
  try {
    const { data: task, error } = await db.from('tasks')
      .insert({
        org_id: ORG_ID,
        description: input.description,
        due_date: input.due_date ?? null,
        escalation: input.escalation ?? false,
      })
      .select().single()
    if (error) return { error: error.message }

    await db.from('task_events').insert({ task_id: task.id, event_type: 'created', metadata: { source: 'chat' } })

    const linked: string[] = []

    if (input.brand_name) {
      const brand = await resolveEntityByName(db, input.brand_name, 'brand')
      if (brand) {
        await db.from('task_entities').insert({ task_id: task.id, entity_id: brand.id, role: 'brand' })
        linked.push(`brand: ${brand.name}`)
      }
    }

    if (input.assignee_name) {
      const assignee = await resolveEntityByName(db, input.assignee_name)
      if (assignee) {
        await db.from('task_entities').insert({ task_id: task.id, entity_id: assignee.id, role: 'assignee' })
        linked.push(`assignee: ${assignee.name}`)
      }
    }

    const linkMsg = linked.length > 0 ? ` Linked ${linked.join(', ')}.` : ''
    return { success: true, task_id: task.id, message: `Created task '${input.description}'.${linkMsg}` }
  } catch (err) {
    return { error: `Failed to create task: ${err instanceof Error ? err.message : String(err)}` }
  }
}

async function assignEntityToTask(db: SupabaseClient, input: { task_id: string; entity_name: string; role: string }) {
  try {
    const entity = await resolveEntityByName(db, input.entity_name)
    if (!entity) return { error: `Could not find an entity matching "${input.entity_name}". Please check the name and try again.` }

    // Check task exists
    const { data: task } = await db.from('tasks').select('id, description').eq('id', input.task_id).single()
    if (!task) return { error: `Task ${input.task_id} not found.` }

    // Check for existing link to avoid duplicates
    const { data: existing } = await db.from('task_entities')
      .select('task_id')
      .eq('task_id', input.task_id)
      .eq('entity_id', entity.id)
      .eq('role', input.role)
      .limit(1)
      .single()

    if (existing) return { success: true, message: `${entity.name} is already linked as ${input.role} on this task.` }

    const { error } = await db.from('task_entities').insert({ task_id: input.task_id, entity_id: entity.id, role: input.role })
    if (error) return { error: error.message }

    return { success: true, message: `Linked ${entity.name} as ${input.role} on task '${task.description}'.` }
  } catch (err) {
    return { error: `Failed to assign entity: ${err instanceof Error ? err.message : String(err)}` }
  }
}

async function addNoteToTask(db: SupabaseClient, input: { task_id: string; note: string }) {
  try {
    const { data: task } = await db.from('tasks').select('id, description').eq('id', input.task_id).single()
    if (!task) return { error: `Task ${input.task_id} not found.` }

    const { error } = await db.from('task_events').insert({
      task_id: input.task_id,
      event_type: 'note_added',
      metadata: { note: input.note },
    })
    if (error) return { error: error.message }

    return { success: true, message: `Added note to task '${task.description}'.` }
  } catch (err) {
    return { error: `Failed to add note: ${err instanceof Error ? err.message : String(err)}` }
  }
}

async function closeTasksForBrand(db: SupabaseClient, input: { brand_name: string }) {
  try {
    const brand = await resolveEntityByName(db, input.brand_name, 'brand')
    if (!brand) return { error: `Could not find a brand matching "${input.brand_name}".` }

    // Find all open tasks linked to this brand
    const { data: taskLinks } = await db.from('task_entities')
      .select('task_id')
      .eq('entity_id', brand.id)
      .eq('role', 'brand')

    if (!taskLinks?.length) return { success: true, message: `No tasks found linked to ${brand.name}.` }

    const taskIds = taskLinks.map((t) => t.task_id)

    // Get only open/blocked tasks (not already done)
    const { data: openTasks } = await db.from('tasks')
      .select('id, description, status')
      .in('id', taskIds)
      .in('status', ['open', 'blocked'])
      .eq('org_id', ORG_ID)

    if (!openTasks?.length) return { success: true, message: `No open tasks found for ${brand.name}.` }

    // Close each task and log events
    const now = new Date().toISOString()
    const events = openTasks.map((t) => ({
      task_id: t.id,
      event_type: 'status_change',
      metadata: { from: t.status, to: 'done' },
    }))

    await db.from('tasks')
      .update({ status: 'done', resolved_at: now })
      .in('id', openTasks.map((t) => t.id))

    await db.from('task_events').insert(events)

    // De-escalate all closed tasks
    for (const t of openTasks) {
      await deEscalateTask(db, t.id, 'task_done')
    }

    const names = openTasks.map((t) => `'${t.description}'`).join(', ')
    return { success: true, message: `Closed ${openTasks.length} task(s) for ${brand.name}: ${names}.` }
  } catch (err) {
    return { error: `Failed to close tasks: ${err instanceof Error ? err.message : String(err)}` }
  }
}

async function logDecision(db: SupabaseClient, input: { summary: string; brand_name?: string; made_by?: string }) {
  const { data: decision, error } = await db.from('decisions')
    .insert({ org_id: ORG_ID, summary: input.summary, made_by: input.made_by ?? null }).select().single()
  if (error) return { error: error.message }
  if (input.brand_name) {
    const safeName = input.brand_name.replace(/[%_\\]/g, '\\$&')
    const { data: brand } = await db.from('entities').select('id').eq('org_id', ORG_ID).ilike('name', `%${safeName}%`).eq('type', 'brand').single()
    if (brand) await db.from('decision_entities').insert({ decision_id: decision.id, entity_id: brand.id, role: 'brand' })
  }
  return { success: true, decision_id: decision.id }
}

async function flagPendingResponse(db: SupabaseClient, input: { summary: string }) {
  const { data: pr, error } = await db.from('pending_responses').insert({ org_id: ORG_ID, summary: input.summary }).select().single()
  return error ? { error: error.message } : { success: true, pending_response_id: pr.id }
}
