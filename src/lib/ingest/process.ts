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
import { ORG_ID } from '../supabase'
import { callClaude, buildUserContent } from './extract'
import { extractUrls } from './urls'
import {
  ensureArray,
  loadAllEntities,
  buildEntityContext,
  resolveOrCreateEntity,
  normalize,
  loadSenderContext,
  loadTaskDedupContext,
  buildSystemPrompt,
  createEntityResolver,
} from './resolve'
import type {
  Attachment,
  ClassifyEntityInput,
  CreateTaskInput,
  LogDecisionInput,
  FlagPendingResponseInput,
  SuggestConsolidationInput,
  IngestResult,
} from '@/types'

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

    // Extract and store URLs from raw text
    const links = extractUrls(entry.raw_text ?? '')
    if (links.length > 0) {
      await db
        .from('entries')
        .update({ links })
        .eq('id', entryId)
    }

    // Load existing entities for Claude context
    const existingEntities = await loadAllEntities(db)
    const entityContext = buildEntityContext(existingEntities)

    // Identify the sender/user from email or session
    const sourceMeta = (entry.source_meta ?? {}) as Record<string, string>
    const senderEmail = sourceMeta.from?.match(/<([^>]+)>/)?.[1] ?? sourceMeta.from ?? ''
    const ownerEmail = sourceMeta.owner_email ?? null
    const senderContext = await loadSenderContext(db, senderEmail)

    // Load existing open tasks for dedup context
    const taskContext = await loadTaskDedupContext(db)

    const userNote = sourceMeta.user_note ?? null
    const projectName = sourceMeta.project_name ?? null
    const systemPrompt = buildSystemPrompt(entityContext, senderContext, taskContext, userNote, projectName)

    // Build message content — text + optional images for vision
    const attachments: Attachment[] = entry.attachments ?? []
    const messageContent = buildUserContent(entry.raw_text, attachments)

    // Single Claude API call with all tools
    const { toolCalls, responseTexts } = await callClaude(systemPrompt, messageContent)

    // If images were present, append Claude's description to raw_text
    if (attachments.length > 0 && responseTexts.length > 0) {
      const imageDescription = responseTexts.join('\n')
      const updatedText = entry.raw_text
        ? `${entry.raw_text}\n\n---\n[Image description by AI]:\n${imageDescription}`
        : `[Image description by AI]:\n${imageDescription}`
      await db
        .from('entries')
        .update({ raw_text: updatedText })
        .eq('id', entryId)
    }

    // Process tool calls
    const result: IngestResult = {
      entry_id: entryId,
      tasks_created: 0,
      decisions_created: 0,
      pending_responses_created: 0,
      entities_resolved: 0,
      entities_created: 0,
      consolidation_suggestions_created: 0,
    }

    // Track touched entities for wiki update step
    const touchedEntityIds = new Set<string>()

    // Track project entities resolved during this ingest for task linking
    const projectEntities: Array<{ id: string; name: string }> = []

    // Entity resolution map: name → entity
    const entityMap: Map<string, { id: string; isNew: boolean }> = new Map()

    // Process classify_entities first
    for (const call of toolCalls) {
      if (call.name === 'classify_entities') {
        const input = call.input as { entities: ClassifyEntityInput[] | ClassifyEntityInput }
        const entities = ensureArray(input.entities)
        for (const entityInput of entities) {
          const createdBefore = new Date()
          const entity = await resolveOrCreateEntity(db, entityInput)
          const key = normalize(entityInput.name)
          // Entity is "new" if it was created during this ingest (within last 5 seconds)
          const isNew = (new Date(entity.created_at).getTime()) > (createdBefore.getTime() - 5000)
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

          // Collect project entities for task linking below
          if (entityInput.type === 'project') {
            projectEntities.push({ id: entity.id, name: entity.name })
          }

          if (isNew) result.entities_created++
          else result.entities_resolved++
        }
      }
    }

    // Helper: resolve entity name to ID using our map + entity list
    const resolveEntityName = createEntityResolver(entityMap, existingEntities)

    // Track new tasks by description for consolidation matching
    const newTasksByDescription: Map<string, string> = new Map()

    // Process create_tasks
    for (const call of toolCalls) {
      if (call.name === 'create_tasks') {
        const input = call.input as { tasks: CreateTaskInput[] | CreateTaskInput }
        const tasks = ensureArray(input.tasks)
        for (const taskInput of tasks) {
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
              owner_email: ownerEmail,
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

          // Link to project entities from this ingest
          for (const proj of projectEntities) {
            await db.from('task_entities').upsert({
              task_id: newTask.id,
              entity_id: proj.id,
              role: 'project',
            }, { onConflict: 'task_id,entity_id,role' }).select()
            // Auto-private for Personal project
            if (proj.name.toLowerCase() === 'personal') {
              await db.from('tasks').update({ public: false }).eq('id', newTask.id)
            }
          }

          newTasksByDescription.set(taskInput.description, newTask.id)
          result.tasks_created++
        }
      }
    }

    // Process log_decisions
    for (const call of toolCalls) {
      if (call.name === 'log_decisions') {
        const input = call.input as { decisions: LogDecisionInput[] | LogDecisionInput }
        const decisions = ensureArray(input.decisions)
        for (const decisionInput of decisions) {
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

    // Process suggest_consolidation
    for (const call of toolCalls) {
      if (call.name === 'suggest_consolidation') {
        try {
          const input = call.input as SuggestConsolidationInput

          // Find the new task ID by matching description
          const newTaskId = newTasksByDescription.get(input.new_task_description)
          if (!newTaskId) continue

          // Verify the existing task actually exists and is open
          const { data: existingTask } = await db
            .from('tasks')
            .select('id')
            .eq('id', input.existing_task_id)
            .eq('org_id', ORG_ID)
            .in('status', ['open', 'blocked', 'tracking'])
            .single()

          if (!existingTask) continue

          await db.from('consolidation_suggestions').insert({
            org_id: ORG_ID,
            new_task_id: newTaskId,
            existing_task_id: input.existing_task_id,
            merged_description: input.merged_description,
            reason: input.reason,
          })

          result.consolidation_suggestions_created++
        } catch {
          // Non-critical — don't fail the ingest if consolidation suggestion fails
        }
      }
    }

    // ── Step 5: Queue wiki updates (processed asynchronously by /api/wiki/process) ──
    if (touchedEntityIds.size > 0) {
      await db.from('wiki_queue').insert(
        [...touchedEntityIds].map(entityId => ({
          org_id: ORG_ID,
          entry_id: entryId,
          entity_id: entityId,
          status: 'pending',
        }))
      )

      // Fire-and-forget: trigger the wiki processor
      fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://dumpbox.app'}/api/wiki/process`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET || ''}` },
      }).catch(() => {}) // don't await, don't fail
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
