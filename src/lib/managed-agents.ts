/**
 * Managed Agents — real REST implementation.
 * API launched April 8, 2026. Beta header: managed-agents-2026-04-01
 *
 * One-time setup (run scripts/setup-agent.ts once):
 *   POST /v1/agents      → MANAGED_AGENT_ID
 *   POST /v1/environments → MANAGED_ENVIRONMENT_ID
 *
 * Per-conversation:
 *   POST /v1/sessions                   → session_id
 *   POST /v1/sessions/:id/events        → send user.message / tool results
 *   GET  /v1/sessions/:id/stream        → SSE event stream
 */

const BASE = 'https://api.anthropic.com'
const BETA = 'managed-agents-2026-04-01'
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
// One-time setup — run scripts/setup-agent.ts
// ─────────────────────────────────────────

export async function createAgent(wikiIndex?: string): Promise<string> {
  const system = `You are a brand operations assistant for a marketing agency managing 7 brands: MaidPro, USA Insulation, Pestmaster, Men In Kilts, Mold Medics, Miracle Method, and Granite Garage Floors.

You have access to structured data (tasks, decisions, entries) and a synthesized wiki with narrative knowledge about each brand.

${wikiIndex ? `WIKI INDEX:\n${wikiIndex}\n\n` : ''}Tool usage order:
1. For questions about a specific brand/vendor/contact: call read_wiki FIRST, then query structured data if needed.
2. For broad questions: call search_wiki first, then read relevant pages.
3. For operational specifics (exact task lists, due dates): use query_tasks / query_decisions after reading wiki.

Be concise. Lead with the answer. The wiki is your primary knowledge source.`

  const res = await fetch(`${BASE}/v1/agents`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      name: 'Second Brain Assistant',
      model: 'claude-sonnet-4-5',
      system,
      tools: AGENT_TOOL_DEFINITIONS,
    }),
  })

  if (!res.ok) throw new Error(`createAgent failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return data.id
}

export async function createEnvironment(): Promise<string> {
  const res = await fetch(`${BASE}/v1/environments`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      name: 'second-brain-prod',
      config: {
        type: 'cloud',
        networking: { type: 'unrestricted' },
      },
    }),
  })

  if (!res.ok) throw new Error(`createEnvironment failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return data.id
}

// ─────────────────────────────────────────
// Per-conversation session management
// ─────────────────────────────────────────

export async function createSession(): Promise<string> {
  const agentId = process.env.MANAGED_AGENT_ID
  const envId = process.env.MANAGED_ENVIRONMENT_ID

  if (!agentId || !envId) {
    throw new Error('MANAGED_AGENT_ID and MANAGED_ENVIRONMENT_ID must be set. Run: npx tsx scripts/setup-agent.ts')
  }

  const res = await fetch(`${BASE}/v1/sessions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      agent: agentId,
      environment_id: envId,
      title: `Second Brain session ${new Date().toISOString()}`,
    }),
  })

  if (!res.ok) throw new Error(`createSession failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return data.id
}

/** Send a user message to an existing session. */
export async function sendUserMessage(sessionId: string, text: string): Promise<void> {
  const res = await fetch(`${BASE}/v1/sessions/${sessionId}/events?beta=true`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      events: [
        {
          type: 'user.message',
          content: [{ type: 'text', text }],
        },
      ],
    }),
  })
  if (!res.ok) throw new Error(`sendUserMessage failed: ${res.status} ${await res.text()}`)
}

/** Submit a custom tool result back to the session. */
export async function sendToolResult(
  sessionId: string,
  toolUseId: string,
  result: unknown
): Promise<void> {
  const res = await fetch(`${BASE}/v1/sessions/${sessionId}/events?beta=true`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      events: [
        {
          type: 'user.custom_tool_result',
          custom_tool_use_id: toolUseId,
          content: [{ type: 'text', text: JSON.stringify(result) }],
        },
      ],
    }),
  })
  if (!res.ok) throw new Error(`sendToolResult failed: ${res.status} ${await res.text()}`)
}

/**
 * Open the SSE event stream for a session.
 * Returns the raw Response so the caller can stream it.
 */
export async function openSessionStream(sessionId: string): Promise<Response> {
  const res = await fetch(`${BASE}/v1/sessions/${sessionId}/stream?beta=true`, {
    method: 'GET',
    headers: {
      ...headers(),
      Accept: 'text/event-stream',
    },
  })
  if (!res.ok) throw new Error(`openSessionStream failed: ${res.status} ${await res.text()}`)
  return res
}

// ─────────────────────────────────────────
// Tool definitions — passed to agent on creation
// Executed client-side (our server) when agent emits agent.custom_tool_use
// ─────────────────────────────────────────

export const AGENT_TOOL_DEFINITIONS = [
  {
    type: 'custom_20260401',
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
    type: 'custom_20260401',
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
    type: 'custom_20260401',
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
    type: 'custom_20260401',
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
    type: 'custom_20260401',
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
    type: 'custom_20260401',
    name: 'update_task',
    description: 'Update a task status, due date, or other fields.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task UUID' },
        status: { type: 'string', enum: ['open', 'done', 'blocked'] },
        due_date: { type: 'string' },
        description: { type: 'string' },
        waiting_on: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    type: 'custom_20260401',
    name: 'create_task',
    description: 'Create a new task.',
    input_schema: {
      type: 'object',
      properties: {
        description: { type: 'string' },
        brand_name: { type: 'string' },
        due_date: { type: 'string' },
        waiting_on: { type: 'string' },
      },
      required: ['description'],
    },
  },
  {
    type: 'custom_20260401',
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
    type: 'custom_20260401',
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
