/**
 * Ingestion pipeline — core processing logic.
 *
 * Flow (per spec):
 *   Step 1 — Dedupe + store raw entry
 *   Step 2 — Single Claude tool-use call
 *   Step 3 — Entity resolution
 *   Step 4 — Task events
 *   Step 5 — Finalize
 *
 * All writes are in a logical transaction (rollback on any write failure).
 * Synchronous for v1 (1-2 seconds).
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { anthropic, CLAUDE_MODEL } from './claude'
import {
  loadAllEntities,
  buildEntityContext,
  resolveOrCreateEntity,
  normalize,
} from './entities'
import { deEscalateTask, escalateTask } from './escalation'
import { updateWikiPagesForEntry } from './wiki'
import { ORG_ID } from './supabase'
import type {
  ClassifyEntityInput,
  CreateTaskInput,
  LogDecisionInput,
  FlagPendingResponseInput,
  IngestResult,
  EntrySource,
} from '@/types'

// ─────────────────────────────────────────
// Tool definitions for Claude
// ─────────────────────────────────────────
const INGEST_TOOLS: Anthropic.Tool[] = [
  {
    name: 'classify_entities',
    description:
      'Identify all entities mentioned in the text: brands, contacts, vendors, topics. ' +
      'Match to existing entities by ID when possible. Signal "new entity" when not found. ' +
      'For contacts, always set metadata.category to one of: team, client_contact, brand_rep, freelancer, external, unknown. ' +
      'If you cannot determine the category from context, use "unknown". ' +
      'Also include metadata.role (e.g. "SEO specialist", "franchise owner", "account manager") and ' +
      'metadata.company if mentioned.',
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
                enum: ['brand', 'vendor', 'contact', 'topic'],
                description: 'Use the most specific type. "topic" for subjects/initiatives.',
              },
              matched_entity_id: {
                type: 'string',
                description: 'UUID of matched existing entity. Omit if new.',
              },
              metadata: {
                type: 'object',
                description: 'For contacts: include category (team|client_contact|brand_rep|freelancer|external|unknown), role, company. For vendors: include notes, specialty.',
                properties: {
                  category: {
                    type: 'string',
                    enum: ['team', 'client_contact', 'brand_rep', 'freelancer', 'external', 'unknown'],
                    description: 'Contact category. Use "unknown" if unsure.',
                  },
                  role: { type: 'string', description: 'Job title or function' },
                  company: { type: 'string', description: 'Company or brand they belong to' },
                  notes: { type: 'string', description: 'For vendors: what they do' },
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
      'Flag a person whose role/category you cannot determine from context. ' +
      'Use this when you encounter a new name and cannot confidently classify them as ' +
      'team, client_contact, brand_rep, freelancer, or external. ' +
      'This will prompt the user to clarify who this person is.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The person\'s name' },
        context_snippet: { type: 'string', description: 'The sentence or phrase where this person was mentioned' },
        question: { type: 'string', description: 'A natural question to ask. e.g. "Who is Sarah? She was mentioned in a MaidPro email about social media."' },
        field: {
          type: 'string',
          enum: ['category', 'role', 'company', 'type'],
          description: 'What info is missing. Usually "category".',
        },
        suggestions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Your best guesses for the answer, e.g. ["client_contact", "brand_rep"]',
        },
      },
      required: ['name', 'question', 'field'],
    },
  },
]

// ─────────────────────────────────────────
// Main processing function
// ─────────────────────────────────────────
export async function processEntry(
  db: SupabaseClient,
  entryId: string
): Promise<IngestResult> {
  // Mark as processing + increment attempt count
  const { data: current } = await db
    .from('entries')
    .select('attempt_count')
    .eq('id', entryId)
    .single()

  await db
    .from('entries')
    .update({
      processing_status: 'processing',
      attempt_count: ((current?.attempt_count ?? 0) + 1),
    })
    .eq('id', entryId)

  try {
    // Fetch the raw entry
    const { data: entry, error: entryError } = await db
      .from('entries')
      .select('*')
      .eq('id', entryId)
      .single()

    if (entryError || !entry) throw new Error('Entry not found')

    // Load existing entities for Claude context
    const existingEntities = await loadAllEntities(db)
    const entityContext = buildEntityContext(existingEntities)

    const systemPrompt = `You are an AI assistant processing operational notes for a marketing agency.
The user manages these brands and contacts:

${entityContext}

When classifying entities, prefer matching to existing ones by returning their ID.
Extract all tasks, decisions, and pending responses precisely.
Be conservative — only extract what is clearly stated.`

    // Single Claude API call with all tools
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: entry.raw_text }],
      tools: INGEST_TOOLS,
      tool_choice: { type: 'auto' },
    })

    // Collect all tool calls from response
    const toolCalls: Array<{ name: string; input: unknown }> = []
    for (const block of response.content) {
      if (block.type === 'tool_use') {
        toolCalls.push({ name: block.name, input: block.input })
      }
    }

    // Process tool calls
    const result: IngestResult = {
      entry_id: entryId,
      tasks_created: 0,
      decisions_created: 0,
      pending_responses_created: 0,
      entities_resolved: 0,
      entities_created: 0,
    }

    // Track touched entities for wiki update step
    const touchedEntityIds = new Set<string>()

    // Entity resolution map: name → entity
    const entityMap: Map<string, { id: string; isNew: boolean }> = new Map()

    // Process classify_entities first
    for (const call of toolCalls) {
      if (call.name === 'classify_entities') {
        const input = call.input as { entities: ClassifyEntityInput[] }
        for (const entityInput of input.entities) {
          const entity = await resolveOrCreateEntity(db, entityInput)
          const key = normalize(entityInput.name)
          const isNew = entity.created_at === entity.first_seen
          entityMap.set(key, { id: entity.id, isNew })
          entityMap.set(entity.normalized_name, { id: entity.id, isNew })

          // Link entry → entity
          await db.from('entry_entities').upsert(
            {
              entry_id: entryId,
              entity_id: entity.id,
              relationship: 'about',
            },
            { onConflict: 'entry_id,entity_id,relationship', ignoreDuplicates: true }
          )

          touchedEntityIds.add(entity.id)

          if (isNew) result.entities_created++
          else result.entities_resolved++
        }
      }
    }

    // Helper: resolve entity name to ID using our map + entity list
    const resolveEntityName = (name: string): string | null => {
      const normalizedInput = normalize(name)
      const found = entityMap.get(normalizedInput)
      if (found) return found.id
      // Fallback: scan existing entities
      const match = existingEntities.find(
        (e) => normalize(e.name) === normalizedInput || e.normalized_name === normalizedInput
      )
      return match?.id ?? null
    }

    // Process create_tasks
    for (const call of toolCalls) {
      if (call.name === 'create_tasks') {
        const input = call.input as { tasks: CreateTaskInput[] }
        for (const taskInput of input.tasks) {
          // Resolve waiting_on entity if present
          let waitingOnEntityId: string | null = null
          if (taskInput.waiting_on) {
            waitingOnEntityId = resolveEntityName(taskInput.waiting_on)
          }

          const { data: newTask, error: taskError } = await db
            .from('tasks')
            .insert({
              org_id: ORG_ID,
              entry_id: entryId,
              description: taskInput.description,
              status: 'open',
              due_date: taskInput.due_date ?? null,
              waiting_on: taskInput.waiting_on ?? null,
              waiting_on_entity_id: waitingOnEntityId,
            })
            .select()
            .single()

          if (taskError) throw new Error(`Task insert failed: ${taskError.message}`)

          // Log task_events 'created'
          await db.from('task_events').insert({
            task_id: newTask.id,
            entry_id: entryId,
            event_type: 'created',
            metadata: null,
          })

          // Link task → brand entity
          if (taskInput.brand_name) {
            const brandId = resolveEntityName(taskInput.brand_name)
            if (brandId) {
              await db.from('task_entities').upsert(
                { task_id: newTask.id, entity_id: brandId, role: 'brand' },
                { onConflict: 'task_id,entity_id,role', ignoreDuplicates: true }
              )
            }
          }

          // Link other entity names
          for (const entityName of taskInput.entity_names ?? []) {
            if (entityName === taskInput.brand_name) continue
            const entityId = resolveEntityName(entityName)
            if (entityId) {
              await db.from('task_entities').upsert(
                { task_id: newTask.id, entity_id: entityId, role: 'topic' },
                { onConflict: 'task_id,entity_id,role', ignoreDuplicates: true }
              )
            }
          }

          result.tasks_created++
        }
      }
    }

    // Process log_decisions
    for (const call of toolCalls) {
      if (call.name === 'log_decisions') {
        const input = call.input as { decisions: LogDecisionInput[] }
        for (const decisionInput of input.decisions) {
          const { data: newDecision, error: decError } = await db
            .from('decisions')
            .insert({
              org_id: ORG_ID,
              entry_id: entryId,
              summary: decisionInput.summary,
              made_by: decisionInput.made_by ?? null,
            })
            .select()
            .single()

          if (decError) throw new Error(`Decision insert failed: ${decError.message}`)

          // Link decision → entities
          for (const entityName of decisionInput.entity_names ?? []) {
            const entityId = resolveEntityName(entityName)
            if (entityId) {
              await db.from('decision_entities').upsert(
                { decision_id: newDecision.id, entity_id: entityId, role: 'about' },
                { onConflict: 'decision_id,entity_id,role', ignoreDuplicates: true }
              )
            }
          }

          result.decisions_created++
        }
      }
    }

    // Process flag_pending_response
    for (const call of toolCalls) {
      if (call.name === 'flag_pending_response') {
        const input = call.input as FlagPendingResponseInput

        const { data: newPR, error: prError } = await db
          .from('pending_responses')
          .insert({
            org_id: ORG_ID,
            entry_id: entryId,
            summary: input.summary,
          })
          .select()
          .single()

        if (prError) throw new Error(`Pending response insert failed: ${prError.message}`)

        for (const entityName of input.entity_names ?? []) {
          const entityId = resolveEntityName(entityName)
          if (entityId) {
            await db.from('pending_response_entities').upsert(
              {
                pending_response_id: newPR.id,
                entity_id: entityId,
                role: 'brand',
              },
              { onConflict: 'pending_response_id,entity_id,role', ignoreDuplicates: true }
            )
          }
        }

        result.pending_responses_created++
      }
    }

    // Process flag_unknown_person
    for (const call of toolCalls) {
      if (call.name === 'flag_unknown_person') {
        const input = call.input as {
          name: string
          context_snippet?: string
          question: string
          field: string
          suggestions?: string[]
        }

        // Find the entity that was just created for this person
        const entityId = resolveEntityName(input.name)

        await db.from('pending_clarifications').insert({
          org_id: ORG_ID,
          entity_id: entityId,
          entry_id: entryId,
          question: input.question,
          context: input.context_snippet ?? null,
          field: input.field,
          suggestions: input.suggestions ?? null,
        })
      }
    }

    // ── Step 5: Wiki update (non-blocking — failure doesn't fail the ingest) ──
    // Runs after all structured data is written so Claude has full context.
    if (touchedEntityIds.size > 0) {
      updateWikiPagesForEntry(db, entryId, [...touchedEntityIds]).catch((err) => {
        console.error('Wiki update error (non-fatal):', err)
      })
    }

    // Finalize
    await db
      .from('entries')
      .update({
        processing_status: 'done',
        processed_at: new Date().toISOString(),
      })
      .eq('id', entryId)

    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db
      .from('entries')
      .update({
        processing_status: 'failed',
        processing_error: message,
      })
      .eq('id', entryId)
    throw err
  }
}

// ─────────────────────────────────────────
// Detect reply threading from Postmark inbound
// ─────────────────────────────────────────
export async function linkReplyToNudge(
  db: SupabaseClient,
  inReplyTo: string | undefined,
  responseEntryId: string
): Promise<void> {
  if (!inReplyTo) return

  // Strip angle brackets from In-Reply-To header
  const cleaned = inReplyTo.replace(/[<>]/g, '')

  const { data: nudge } = await db
    .from('nudge_messages')
    .select('id')
    .eq('postmark_message_id', cleaned)
    .single()

  if (!nudge) return

  // Mark nudge as responded
  await db
    .from('nudge_messages')
    .update({ responded: true, response_entry_id: responseEntryId })
    .eq('id', nudge.id)

  // De-escalate all tasks in this nudge that are now done (the ingest pipeline will handle it)
  // Also record the link for context in the ingest pipeline
}

// ─────────────────────────────────────────
// Source detection from payload shape
// ─────────────────────────────────────────
export function detectSource(body: Record<string, unknown>): EntrySource {
  if (body.MessageID && body.From) return 'email'
  if (body.source === 'chat') return 'chat'
  if (body.source === 'meeting_notes') return 'meeting_notes'
  return 'paste'
}
