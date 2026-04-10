/**
 * Managed Agents — REST implementation.
 *
 * Correct API format (discovered via testing):
 *   POST /v1/sessions — agent is {type: "agent_reference", id: "..."}, environment not environment_id
 *   POST /v1/sessions/:id/events — event type is "user" not "user.message"
 *   POST /v1/sessions/:id/events — tool results: type "tool_result" with tool_use_id
 *   GET  /v1/sessions/:id/events — poll for agent events (not SSE stream)
 *   GET  /v1/sessions/:id — check session status
 *
 * Beta header: agent-api-2026-03-01
 */

const BASE = 'https://api.anthropic.com'
const BETA = 'agent-api-2026-03-01'
const VERSION = '2023-06-01'

function headers() {
  return {
    'x-api-key': process.env.ANTHROPIC_API_KEY!,
    'anthropic-version': VERSION,
    'anthropic-beta': BETA,
    'content-type': 'application/json',
  }
}

// ─────────────────────────────────────────
// Session management
// ─────────────────────────────────────────

export async function createSession(): Promise<string> {
  const agentId = process.env.MANAGED_AGENT_ID
  const envId = process.env.MANAGED_ENVIRONMENT_ID

  if (!agentId || !envId) {
    throw new Error('MANAGED_AGENT_ID and MANAGED_ENVIRONMENT_ID must be set.')
  }

  const res = await fetch(`${BASE}/v1/sessions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      agent: { type: 'agent_reference', id: agentId },
      environment: envId,
      title: `Second Brain ${new Date().toISOString()}`,
    }),
  })

  if (!res.ok) throw new Error(`createSession failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return data.id
}

/** Send a user message to a session, optionally with image attachments. */
export async function sendUserMessage(
  sessionId: string,
  text: string,
  imageUrls?: Array<{ url: string; filename: string }>
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = []

  if (text) {
    content.push({ type: 'text', text })
  }

  if (imageUrls?.length) {
    for (const img of imageUrls) {
      content.push({
        type: 'image',
        source: { type: 'url', url: img.url },
      })
    }
  }

  const res = await fetch(`${BASE}/v1/sessions/${sessionId}/events`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      events: [{
        type: 'user',
        content,
      }],
    }),
  })
  if (!res.ok) throw new Error(`sendUserMessage failed: ${res.status} ${await res.text()}`)
}

/** Submit a tool result back to the session. */
export async function sendToolResult(
  sessionId: string,
  toolUseId: string,
  result: unknown
): Promise<void> {
  const res = await fetch(`${BASE}/v1/sessions/${sessionId}/events`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      events: [{
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: [{ type: 'text', text: JSON.stringify(result) }],
      }],
    }),
  })
  if (!res.ok) throw new Error(`sendToolResult failed: ${res.status} ${await res.text()}`)
}

/** Get all events for a session (polling-based, not SSE). */
export async function getSessionEvents(sessionId: string): Promise<SessionEvent[]> {
  const url = `${BASE}/v1/sessions/${sessionId}/events?order=asc&limit=100`

  const res = await fetch(url, { headers: headers() })
  if (!res.ok) throw new Error(`getSessionEvents failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return data.data ?? []
}

/** Get session status. */
export async function getSessionStatus(sessionId: string): Promise<string> {
  const res = await fetch(`${BASE}/v1/sessions/${sessionId}`, { headers: headers() })
  if (!res.ok) throw new Error(`getSessionStatus failed: ${res.status}`)
  const data = await res.json()
  return data.status  // 'pending' | 'running' | 'idle' | 'completed'
}

// ─────────────────────────────────────────
// Event types
// ─────────────────────────────────────────

export interface SessionEvent {
  id: string
  type: string  // 'user' | 'agent' | 'tool_use' | 'tool_result' | 'status_running' | 'status_idle' | 'model_request_start' | 'model_request_end'
  content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>
  tool_name?: string
  tool_use_id?: string
  input?: unknown
  stop_reason?: { type: string }
}

// ─────────────────────────────────────────
// Tool definitions — passed to agent on creation
// ─────────────────────────────────────────

export const AGENT_TOOL_DEFINITIONS = [
  {
    type: 'custom',
    name: 'read_wiki',
    description:
      'Read the synthesized wiki page for a brand, vendor, contact, or topic. ' +
      'ALWAYS call this first when answering a question about a specific entity. ' +
      'Use the slug from the wiki index (e.g. "miracle-method", "maidpro", "moe-seo").',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Wiki page slug, e.g. "miracle-method"' },
      },
      required: ['slug'],
    },
  },
  {
    type: 'custom',
    name: 'search_wiki',
    description: 'Search wiki page summaries for a topic or keyword.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term to look for across wiki summaries' },
      },
      required: ['query'],
    },
  },
  {
    type: 'custom',
    name: 'query_tasks',
    description: 'Query tasks with optional filters. Returns task list.',
    input_schema: {
      type: 'object',
      properties: {
        brand_name: { type: 'string' },
        status: { type: 'string', enum: ['open', 'done', 'blocked'] },
        escalation: { type: 'boolean' },
        due_before: { type: 'string', description: 'ISO date' },
        limit: { type: 'number' },
      },
    },
  },
  {
    type: 'custom',
    name: 'query_entries',
    description: 'Query raw entries (emails, dumps) with filters.',
    input_schema: {
      type: 'object',
      properties: {
        brand_name: { type: 'string' },
        source: { type: 'string' },
        limit: { type: 'number' },
        since: { type: 'string', description: 'ISO datetime' },
      },
    },
  },
  {
    type: 'custom',
    name: 'query_decisions',
    description: 'Query logged decisions.',
    input_schema: {
      type: 'object',
      properties: {
        brand_name: { type: 'string' },
        limit: { type: 'number' },
        since: { type: 'string' },
      },
    },
  },
  {
    type: 'custom',
    name: 'update_task',
    description: 'Update a task\'s status, escalation, due date, or waiting_on field.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task UUID' },
        status: { type: 'string', enum: ['open', 'blocked', 'closed'] },
        escalation: { type: 'boolean', description: 'Escalation flag' },
        due_date: { type: ['string', 'null'], description: 'ISO date or null to clear' },
        waiting_on: { type: ['string', 'null'], description: 'Who/what the task is waiting on, or null to clear' },
      },
      required: ['task_id'],
    },
  },
  {
    type: 'custom',
    name: 'create_task',
    description: 'Create a new task from conversation.',
    input_schema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Task description' },
        brand_name: { type: 'string', description: 'Brand to link the task to' },
        assignee_name: { type: 'string', description: 'Contact to assign the task to' },
        due_date: { type: 'string', description: 'ISO date' },
        escalation: { type: 'boolean', description: 'Whether to escalate immediately (default false)' },
      },
      required: ['description'],
    },
  },
  {
    type: 'custom',
    name: 'assign_entity_to_task',
    description: 'Link an entity (person, brand, etc.) to a task. Use to assign someone to a task or associate a brand.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task UUID' },
        entity_name: { type: 'string', description: 'Name of the entity to link (resolved by fuzzy match)' },
        role: { type: 'string', enum: ['assignee', 'brand', 'related'], description: 'Role of the entity on this task' },
      },
      required: ['task_id', 'entity_name', 'role'],
    },
  },
  {
    type: 'custom',
    name: 'add_note_to_task',
    description: 'Add a note to a task\'s event timeline.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task UUID' },
        note: { type: 'string', description: 'Note text to add' },
      },
      required: ['task_id', 'note'],
    },
  },
  {
    type: 'custom',
    name: 'close_tasks_for_brand',
    description: 'Bulk close all open tasks linked to a brand.',
    input_schema: {
      type: 'object',
      properties: {
        brand_name: { type: 'string', description: 'Brand name to close tasks for' },
      },
      required: ['brand_name'],
    },
  },
  {
    type: 'custom',
    name: 'log_decision',
    description: 'Record a decision that was made.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        brand_name: { type: 'string' },
        made_by: { type: 'string' },
      },
      required: ['summary'],
    },
  },
  {
    type: 'custom',
    name: 'flag_pending_response',
    description: 'Flag that something needs a response.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        brand_name: { type: 'string' },
      },
      required: ['summary'],
    },
  },
]
