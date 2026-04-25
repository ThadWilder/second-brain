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
    .in('status', ['open', 'blocked', 'tracking'])
    .order('created_at', { ascending: false })
    .limit(50)
  if ((openTasks ?? []).length > 0) {
    return `\n\nEXISTING OPEN TASKS (do NOT create duplicates):\n${(openTasks ?? []).map((t: { id: string; description: string }) => `- [${t.id}] ${t.description}`).join('\n')}\n\nIf the content mentions a task that matches an existing one above, DO NOT create a new task. Only create tasks that are genuinely new and not already tracked.\n\nHowever, if a new task is RELATED to but not identical to an existing task (e.g. overlapping scope, same deliverable from a different angle, or one is a subset of the other), you should BOTH create the new task via create_tasks AND call suggest_consolidation to flag the overlap. This lets the user decide whether to merge them.`
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
  userNote?: string | null,
  projectName?: string | null,
): string {
  const today = new Date().toISOString().slice(0, 10)
  let prompt = `You are an AI assistant processing operational notes for a marketing agency.
The operator is Brandy Murch (VP Digital Marketing at Threshold Brands).
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

TASK INTENT — WHO IS THIS TASK FOR?
Before creating any task, determine who actually needs to act:
- If Brandy is directly asked to do something → create a normal task
- If someone ELSE needs to do something (franchisee, vendor, team member) and Brandy is just tracking it → create the task with waiting_on set to that person's name and mark it as a tracking item
- If the content is purely informational (FYI, status update, no action needed by anyone) → do NOT create tasks, just classify entities and log decisions

KEYWORD OVERRIDES: If the text starts with these prefixes, follow them exactly:
- "FYI:" → No tasks. Just classify entities and log decisions. This is context for the wiki only.
- "TRACK:" → Create tasks but set waiting_on to the responsible person. Brandy is monitoring, not doing.

Signs this is NOT Brandy's task:
- Email is between two other people that Brandy forwarded
- The action items reference someone else doing the work ("Howard needs to send...", "franchisee should review...")
- It's a status update or report with no ask

Signs this IS Brandy's task:
- Directly addressed to Brandy ("Can you...", "Brandy, please...")
- Action items that require Brandy's expertise or access (setting up GBP, reviewing analytics)
- Internal team coordination that Brandy owns

Extract decisions and pending responses precisely.
Be conservative — only extract what is clearly stated.
When resolving relative dates like "Friday" or "next week", use today's date (${today}) as the reference.

TASK GRANULARITY: Create ONE task per initiative or outcome, not per micro-step. Group related sub-actions into a single task with details in the description. A typical email should produce 1-3 tasks. If you find yourself creating more than 5 tasks from one message, consolidate.`

  // Append note context if present
  if (userNote) {
    prompt += `\n\nThe sender added this note when forwarding: "${userNote}"\nConsider this context when extracting tasks and decisions.`
  }

  // Append project context if present
  if (projectName) {
    prompt += `\n\nThe sender tagged this with PROJECT:${projectName}. All extracted tasks and decisions should be associated with this project entity. If this project doesn't exist yet, include it in classify_entities as type "project".`
  }

  return prompt
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
