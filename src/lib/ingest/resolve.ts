/**
 * Entity resolution, sender context, and task dedup context for the ingest pipeline.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import {
  loadAllEntities,
  buildEntityContext,
  resolveOrCreateEntity,
  normalize,
} from '../entities'
import { ORG_ID } from '../supabase'
import type { Entity } from '@/types'

// Re-export entity functions used by process.ts
export { loadAllEntities, buildEntityContext, resolveOrCreateEntity, normalize }

/** Wrap a value that may be a single item, an array, null, or undefined into a guaranteed array. */
export function ensureArray<T>(input: T | T[] | null | undefined): T[] {
  if (Array.isArray(input)) return input
  if (input != null) return [input]
  return []
}

/**
 * Look up the sender entity from an email alias.
 * Returns a context string for the Claude system prompt, or empty string.
 */
export async function loadSenderContext(
  db: SupabaseClient,
  senderEmail: string,
): Promise<string> {
  if (!senderEmail) return ''

  const { data: aliasMatch } = await db
    .from('entity_aliases')
    .select('entity_id, entities(name, type)')
    .eq('normalized_alias', senderEmail.toLowerCase())
    .limit(1)
  const match = aliasMatch?.[0] as unknown as { entity_id: string; entities: { name: string; type: string } } | undefined
  if (match?.entities) {
    return `\n\nThe sender of this content is ${match.entities.name} (${match.entities.type}). First-person references like "I", "me", "my", "I'll" refer to ${match.entities.name}.`
  }
  return ''
}

/**
 * Load existing open tasks for dedup context in the Claude system prompt.
 * Returns a context string or empty string.
 */
export async function loadTaskDedupContext(db: SupabaseClient): Promise<string> {
  const { data: openTasks } = await db
    .from('tasks')
    .select('id, description, status')
    .eq('org_id', ORG_ID)
    .in('status', ['open', 'blocked'])
    .order('created_at', { ascending: false })
    .limit(50)
  if ((openTasks ?? []).length > 0) {
    return `\n\nEXISTING OPEN TASKS (do NOT create duplicates):\n${(openTasks ?? []).map((t: { id: string; description: string }) => `- [${t.id}] ${t.description}`).join('\n')}\n\nIf the content mentions a task that matches an existing one above, DO NOT create a new task. Only create tasks that are genuinely new and not already tracked.`
  }
  return ''
}

/**
 * Build the system prompt for the Claude ingest call.
 */
export function buildSystemPrompt(
  entityContext: string,
  senderContext: string,
  taskContext: string,
): string {
  const today = new Date().toISOString().slice(0, 10)
  return `You are an AI assistant processing operational notes for a marketing agency.
Today's date is ${today}.${senderContext}

The organization manages these brands and contacts:

${entityContext}${taskContext}

When classifying entities, prefer matching to existing ones by returning their ID.

IMPORTANT: Only link entities who are PRIMARY ACTORS in this content. A primary actor is someone who:
- Has an action item or task assigned to them
- Made a decision that is being recorded
- Needs to respond to something
- Is the sender or direct recipient
- Is explicitly the subject being discussed

DO NOT link entities who are merely:
- Mentioned in passing within a quoted conversation
- Named in an email signature or CC line
- Referenced as historical context ("last year Ray said...")
- Part of a forwarded thread but not relevant to the current action

For example, if someone dumps a recap of a conversation between Brandy and Shane about a MaidPro issue, the primary actors are Brandy, Shane, and MaidPro. Other people mentioned within the conversation ("Joshua had a ticket issue last month") should NOT be linked unless they have a current action item.

Extract all tasks, decisions, and pending responses precisely.
Be conservative — only extract what is clearly stated.
When resolving relative dates like "Friday" or "next week", use today's date (${today}) as the reference.`
}

/**
 * Build a map of entity names to resolved entity IDs.
 * Also provides a helper to resolve entity names to IDs.
 */
export function createEntityResolver(
  entityMap: Map<string, { id: string; isNew: boolean }>,
  existingEntities: Entity[],
) {
  return (name: string): string | null => {
    const normalizedInput = normalize(name)
    const found = entityMap.get(normalizedInput)
    if (found) return found.id
    const match = existingEntities.find(
      (e) => normalize(e.name) === normalizedInput || e.normalized_name === normalizedInput
    )
    return match?.id ?? null
  }
}
