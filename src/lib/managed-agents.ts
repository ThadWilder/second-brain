/**
 * Managed Agents integration.
 *
 * Agent + Environment are created ONCE via `ant` CLI (Anthropic CLI).
 * IDs are stored as env vars. Sessions are created per-conversation.
 *
 * Tool execution model: client-executed.
 * The events route intercepts tool_use events and executes them against Supabase.
 */

import Anthropic from '@anthropic-ai/sdk'
import { anthropic, MANAGED_AGENT_ID, MANAGED_ENVIRONMENT_ID } from './claude'

// Agent tools definition (executed server-side in the events bridge)
// read_wiki and search_wiki are always called FIRST before querying structured rows.
export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_wiki',
    description:
      'Read the synthesized wiki page for a brand, vendor, contact, or topic. ' +
      'ALWAYS call this first when answering a question about a specific entity. ' +
      'The wiki contains synthesized narrative knowledge accumulated over time — ' +
      'it is faster and more complete than querying individual rows. ' +
      'Use the slug from the wiki index (e.g. "miracle-method", "maidpro", "moe-seo").',
    input_schema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'The wiki page slug, e.g. "miracle-method", "maidpro", "moe-seo"',
        },
      },
      required: ['slug'],
    },
  },
  {
    name: 'search_wiki',
    description:
      'Search wiki page summaries for a topic or keyword. ' +
      'Use when you need to find which entities are relevant to a question before reading specific pages.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search term or topic to look for across wiki summaries',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'query_tasks',
    description: 'Query tasks with optional filters. Returns task list.',
    input_schema: {
      type: 'object',
      properties: {
        brand_name: { type: 'string' },
        status: { type: 'string', enum: ['open', 'done', 'blocked'] },
        escalation: { type: 'boolean' },
        due_before: { type: 'string', description: 'ISO date' },
        assigned_to: { type: 'string' },
        limit: { type: 'number', default: 20 },
      },
    },
  },
  {
    name: 'query_entries',
    description: 'Query raw entries (emails, dumps) with filters.',
    input_schema: {
      type: 'object',
      properties: {
        brand_name: { type: 'string' },
        source: { type: 'string' },
        limit: { type: 'number', default: 10 },
        since: { type: 'string', description: 'ISO datetime — entries created after this' },
      },
    },
  },
  {
    name: 'query_entities',
    description: 'Query entities (brands, vendors, contacts, topics).',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string' },
        name: { type: 'string', description: 'Partial name match' },
      },
    },
  },
  {
    name: 'query_decisions',
    description: 'Query logged decisions with optional filters.',
    input_schema: {
      type: 'object',
      properties: {
        brand_name: { type: 'string' },
        limit: { type: 'number', default: 10 },
        since: { type: 'string' },
      },
    },
  },
  {
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

// ─────────────────────────────────────────
// Session management
// ─────────────────────────────────────────

/** Build system prompt with wiki index for a new session. */
export async function buildSessionSystemPrompt(wikiIndex: string): Promise<string> {
  return `You are a brand operations assistant for a marketing agency.
You have access to structured data (tasks, decisions, entries) and a synthesized wiki with narrative knowledge about each brand.

WIKI INDEX (read this first to understand what's available):
${wikiIndex}

Tool usage order:
1. For questions about a specific brand/vendor/contact: call read_wiki FIRST, then query structured data if needed.
2. For broad questions: call search_wiki to find relevant pages, then read those pages.
3. For operational data (exact task counts, specific due dates): query_tasks / query_decisions after reading the wiki.

Be concise. Lead with the answer. Use the wiki as your primary knowledge source — it compounds everything that's been ingested.`
}

/** Create a new Managed Agent session. Returns session ID. */
export async function createAgentSession(wikiIndex?: string): Promise<string> {
  void wikiIndex // will be used in system prompt when SDK supports it
  // @ts-expect-error — beta SDK path
  const session = await anthropic.beta.agents.sessions.create({
    agent_id: MANAGED_AGENT_ID,
    environment_id: MANAGED_ENVIRONMENT_ID,
  })
  return session.id
}

/** Send a message to an existing session. Returns a streaming response. */
export async function sendMessageToSession(
  sessionId: string,
  message: string
): Promise<AsyncIterable<Anthropic.MessageStreamEvent>> {
  // @ts-expect-error — beta SDK path
  return anthropic.beta.agents.sessions.stream(sessionId, {
    messages: [{ role: 'user', content: message }],
    tools: AGENT_TOOLS,
  })
}

/** Submit a tool result back to the session. */
export async function submitToolResult(
  sessionId: string,
  toolUseId: string,
  result: unknown
): Promise<AsyncIterable<Anthropic.MessageStreamEvent>> {
  // @ts-expect-error — beta SDK path
  return anthropic.beta.agents.sessions.stream(sessionId, {
    tool_results: [{ tool_use_id: toolUseId, content: JSON.stringify(result) }],
  })
}
