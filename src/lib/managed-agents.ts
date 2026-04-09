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
export const AGENT_TOOLS: Anthropic.Tool[] = [
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

/** Create a new Managed Agent session. Returns session ID. */
export async function createAgentSession(): Promise<string> {
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
