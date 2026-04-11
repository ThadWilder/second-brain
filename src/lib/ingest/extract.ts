/**
 * Claude tool definitions and API call logic for the ingest pipeline.
 */

import { anthropic, CLAUDE_MODEL } from '../claude'
import type { Attachment } from '@/types'

// ─────────────────────────────────────────
// Tool definitions for Claude
// ─────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const INGEST_TOOLS: any[] = [
  {
    name: 'classify_entities',
    description:
      'Identify all entities mentioned in the text. ' +
      'Match to existing entities by ID when possible. Signal "new entity" when not found. ' +
      'Use the most specific entity type: brand (franchise brands), department (internal teams like TMS, HQ), ' +
      'franchisee (franchise owners/operators), contact (team members), vendor (external companies), ' +
      'vendor_team (people who work at vendors), freelancer (independent contractors). ' +
      'Include metadata.role (job title) and metadata.company if mentioned.',
    input_schema: {
      type: 'object',
      properties: {
        entities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              type: {
                type: 'string',
                enum: ['brand', 'department', 'franchisee', 'contact', 'vendor', 'vendor_team', 'freelancer'],
                description: 'brand=franchise brands, department=internal teams (TMS/HQ), franchisee=franchise owners, contact=team members, vendor=external companies, vendor_team=people at vendors, freelancer=independent contractors.',
              },
              matched_entity_id: {
                type: 'string',
                description: 'UUID of matched existing entity. Omit if new.',
              },
              metadata: {
                type: 'object',
                description: 'Optional metadata: role (job title), company (org they belong to), notes.',
                properties: {
                  role: { type: 'string', description: 'Job title or function' },
                  company: { type: 'string', description: 'Company, brand, or team they belong to' },
                  notes: { type: 'string', description: 'Additional context' },
                },
              },
            },
            required: ['name', 'type'],
          },
        },
      },
      required: ['entities'],
    },
  },
  {
    name: 'create_tasks',
    description: 'Extract action items from the text. Include due dates and assignments when mentioned.',
    input_schema: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              due_date: { type: 'string', description: 'ISO date YYYY-MM-DD' },
              waiting_on: { type: 'string', description: 'Display name of person/vendor we\'re waiting on' },
              brand_name: { type: 'string', description: 'Primary brand this task belongs to' },
              entity_names: {
                type: 'array',
                items: { type: 'string' },
                description: 'Other entity names this task relates to',
              },
            },
            required: ['description'],
          },
        },
      },
      required: ['tasks'],
    },
  },
  {
    name: 'log_decisions',
    description: 'Extract any decisions that were made. A decision is a resolved choice, not a task.',
    input_schema: {
      type: 'object',
      properties: {
        decisions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              made_by: { type: 'string' },
              entity_names: { type: 'array', items: { type: 'string' } },
            },
            required: ['summary'],
          },
        },
      },
      required: ['decisions'],
    },
  },
  {
    name: 'flag_pending_response',
    description: 'Flag if this message requires a reply from you. Only if it\'s clearly awaiting response.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'One sentence: what needs a response and from whom' },
        entity_names: { type: 'array', items: { type: 'string' } },
      },
      required: ['summary'],
    },
  },
  {
    name: 'flag_unknown_person',
    description:
      'Flag a person or entity whose type you cannot determine from context. ' +
      'Use this when you encounter a new name and cannot confidently classify them as ' +
      'contact, vendor, vendor_team, franchisee, freelancer, department, or brand. ' +
      'This will prompt the user to clarify.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The person\'s name' },
        context_snippet: { type: 'string', description: 'The sentence or phrase where this person was mentioned' },
        question: { type: 'string', description: 'A natural question to ask. e.g. "Who is Sarah? She was mentioned in a MaidPro email about social media."' },
        field: {
          type: 'string',
          enum: ['type', 'role', 'company'],
          description: 'What info is missing. Usually "type".',
        },
        suggestions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Your best guesses for entity type, e.g. ["vendor_team", "contact"]',
        },
      },
      required: ['name', 'question', 'field'],
    },
  },
  {
    name: 'suggest_consolidation',
    description:
      'Suggest merging a new task with an existing open task when they are closely related or overlapping ' +
      '(but not exact duplicates). Use this when a new task covers similar ground as an existing one — ' +
      'e.g. both are about the same deliverable, same request from different angles, or one is a subset of the other. ' +
      'Still create the new task via create_tasks AND call this tool to flag the overlap.',
    input_schema: {
      type: 'object',
      properties: {
        new_task_description: {
          type: 'string',
          description: 'The description of the new task being created (must match what you passed to create_tasks).',
        },
        existing_task_id: {
          type: 'string',
          description: 'UUID of the existing open task this overlaps with.',
        },
        merged_description: {
          type: 'string',
          description: 'A suggested combined description if the two tasks were merged into one.',
        },
        reason: {
          type: 'string',
          description: 'Brief explanation of why these tasks overlap (e.g. "Both tasks involve updating the MaidPro social media calendar").',
        },
      },
      required: ['new_task_description', 'existing_task_id', 'merged_description', 'reason'],
    },
  },
]

/**
 * Call Claude with tool-use for entry classification.
 * Returns parsed tool calls and text blocks from the response.
 */
export async function callClaude(
  systemPrompt: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messageContent: any,
): Promise<{ toolCalls: Array<{ name: string; input: unknown }>; responseTexts: string[] }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (anthropic.messages.create as any)({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: messageContent }],
    tools: INGEST_TOOLS,
    tool_choice: { type: 'auto' },
  })

  const toolCalls: Array<{ name: string; input: unknown }> = []
  const responseTexts: string[] = []
  for (const block of response.content) {
    if (block.type === 'tool_use') {
      toolCalls.push({ name: block.name, input: block.input })
    } else if (block.type === 'text' && block.text) {
      responseTexts.push(block.text)
    }
  }

  return { toolCalls, responseTexts }
}

/**
 * Build the user content array from entry text and attachments.
 */
export function buildUserContent(rawText: string | null, attachments: Attachment[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userContent: any[] = []

  if (rawText) {
    userContent.push({ type: 'text', text: rawText })
  }

  for (const att of attachments) {
    if (att.type.startsWith('image/')) {
      userContent.push({
        type: 'image',
        source: { type: 'url', url: att.url },
      })
      userContent.push({
        type: 'text',
        text: `[Attached image: ${att.filename}] — Please describe/transcribe the content of this image and include it in your analysis.`,
      })
    }
  }

  // Fallback: if no content blocks were added, use raw_text
  return userContent.length > 0 ? userContent : rawText
}
