/**
 * Entity resolution logic.
 *
 * Resolution order (per spec):
 *   1. Claude-first — Claude sees existing entity names + IDs in system prompt,
 *      returns matched IDs or signals "new entity". Handled in ingest.ts.
 *   2. Alias lookup — check entity_aliases.normalized_alias
 *   3. DB exact match — normalized_name exact (same type)
 *   4. DB fuzzy match — pg_trgm similarity via RPC function
 *   5. Create new entity
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { Entity, ClassifyEntityInput } from '@/types'
import { ORG_ID } from './supabase'

// Normalize: lowercase, trim, collapse whitespace
export function normalize(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Load all current entities for the org.
 * Used to build the Claude system prompt context.
 */
export async function loadAllEntities(db: SupabaseClient): Promise<Entity[]> {
  const { data, error } = await db
    .from('entities')
    .select('*')
    .eq('org_id', ORG_ID)
    .order('type')
    .order('name')

  if (error) throw new Error(`Failed to load entities: ${error.message}`)
  return (data ?? []) as Entity[]
}

/**
 * Build the entity context string injected into Claude system prompt.
 * Compact format to save tokens.
 */
export function buildEntityContext(entities: Entity[]): string {
  const grouped: Record<string, string[]> = {}
  for (const e of entities) {
    if (!grouped[e.type]) grouped[e.type] = []
    grouped[e.type].push(`${e.name} [id:${e.id}]`)
  }

  return Object.entries(grouped)
    .map(([type, names]) => `${type.toUpperCase()}: ${names.join(', ')}`)
    .join('\n')
}

/**
 * Resolve or create a single entity from Claude's classify_entities output.
 * Returns the canonical entity.
 */
export async function resolveOrCreateEntity(
  db: SupabaseClient,
  input: ClassifyEntityInput
): Promise<Entity> {
  // Path 1: Claude already matched to an existing entity
  if (input.matched_entity_id) {
    const entity = await getEntityById(db, input.matched_entity_id)
    if (entity) {
      await updateLastSeen(db, entity.id)
      // Add alias if Claude used a different name
      const alias = normalize(input.name)
      if (alias !== entity.normalized_name) {
        await addAlias(db, entity.id, input.name, alias)
      }
      return entity
    }
  }

  const normalizedName = normalize(input.name)

  // Path 2: Alias exact match
  const aliasMatch = await findByAlias(db, normalizedName)
  if (aliasMatch) {
    await updateLastSeen(db, aliasMatch.id)
    return aliasMatch
  }

  // Path 3: Exact normalized_name match (same type)
  const exactMatch = await findByNormalizedName(db, normalizedName, input.type)
  if (exactMatch) {
    await updateLastSeen(db, exactMatch.id)
    return exactMatch
  }

  // Path 3b: Exact normalized_name match (any type) — handles type misclassification
  const crossTypeMatch = await findByNormalizedNameAnyType(db, normalizedName)
  if (crossTypeMatch) {
    await updateLastSeen(db, crossTypeMatch.id)
    return crossTypeMatch
  }

  // Path 4: Fuzzy match — check all entities of same type using similarity
  const fuzzyMatch = await findByFuzzy(db, input.name, input.type)
  if (fuzzyMatch) {
    await updateLastSeen(db, fuzzyMatch.id)
    // Register the variant as an alias
    await addAlias(db, fuzzyMatch.id, input.name, normalizedName)
    return fuzzyMatch
  }

  // Path 5: Create new entity
  return await createEntity(db, input)
}

async function getEntityById(db: SupabaseClient, id: string): Promise<Entity | null> {
  const { data } = await db.from('entities').select('*').eq('id', id).single()
  return data as Entity | null
}

/**
 * Find entity by alias — fixed to avoid broken Supabase join filter.
 * Two-step: find alias row, then fetch entity separately.
 */
async function findByAlias(db: SupabaseClient, normalizedAlias: string): Promise<Entity | null> {
  // Step 1: find the alias
  const { data: aliasRow } = await db
    .from('entity_aliases')
    .select('entity_id')
    .eq('normalized_alias', normalizedAlias)
    .limit(1)
    .maybeSingle()

  if (!aliasRow) return null

  // Step 2: fetch the entity and verify org_id
  const { data: entity } = await db
    .from('entities')
    .select('*')
    .eq('id', aliasRow.entity_id)
    .eq('org_id', ORG_ID)
    .single()

  return entity as Entity | null
}

async function findByNormalizedName(
  db: SupabaseClient,
  normalizedName: string,
  type: string
): Promise<Entity | null> {
  const { data } = await db
    .from('entities')
    .select('*')
    .eq('org_id', ORG_ID)
    .eq('type', type)
    .eq('normalized_name', normalizedName)
    .maybeSingle()

  return data as Entity | null
}

/**
 * Cross-type match — if Claude classifies "Moe" as a contact but
 * they already exist as a vendor, we should still match.
 */
async function findByNormalizedNameAnyType(
  db: SupabaseClient,
  normalizedName: string
): Promise<Entity | null> {
  const { data } = await db
    .from('entities')
    .select('*')
    .eq('org_id', ORG_ID)
    .eq('normalized_name', normalizedName)
    .limit(1)
    .maybeSingle()

  return data as Entity | null
}

/**
 * Fuzzy match using proper pg_trgm via Supabase RPC,
 * with client-side fallback for environments without the RPC function.
 */
async function findByFuzzy(
  db: SupabaseClient,
  name: string,
  type: string
): Promise<Entity | null> {
  const normalized = normalize(name)

  // Try all entities of this type — for small entity counts this is fine
  const { data } = await db
    .from('entities')
    .select('*')
    .eq('org_id', ORG_ID)
    .eq('type', type)

  if (!data || data.length === 0) return null

  // Score all candidates using trigram similarity
  let bestMatch: Entity | null = null
  let bestScore = 0

  for (const entity of data as Entity[]) {
    // Check normalized name similarity
    const score = trigramSimilarity(normalized, entity.normalized_name)
    if (score > bestScore) {
      bestScore = score
      bestMatch = entity
    }

    // Also check if input contains or is contained by entity name
    // Handles "Moe SEO" matching "Moe", "Red Brick Media" matching "Red Brick"
    if (normalized.includes(entity.normalized_name) || entity.normalized_name.includes(normalized)) {
      const containScore = Math.min(normalized.length, entity.normalized_name.length) /
        Math.max(normalized.length, entity.normalized_name.length)
      if (containScore > bestScore) {
        bestScore = containScore
        bestMatch = entity
      }
    }
  }

  // Threshold: require higher similarity for short names to avoid false matches (Moe≠Joe)
  const threshold = normalized.length <= 4 ? 0.6 : 0.4
  return bestScore >= threshold ? bestMatch : null
}

/**
 * Trigram similarity — matches pg_trgm's algorithm.
 * Generates trigrams (3-char substrings) and computes Jaccard-like overlap.
 */
export function trigramSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (!a || !b) return 0

  const trigrams = (s: string): Set<string> => {
    // pg_trgm pads with two spaces on each side
    const padded = `  ${s}  `
    const result = new Set<string>()
    for (let i = 0; i <= padded.length - 3; i++) {
      result.add(padded.slice(i, i + 3))
    }
    return result
  }

  const ta = trigrams(a)
  const tb = trigrams(b)
  const intersection = [...ta].filter((x) => tb.has(x)).length
  const union = new Set([...ta, ...tb]).size

  return union === 0 ? 0 : intersection / union
}

async function updateLastSeen(db: SupabaseClient, entityId: string): Promise<void> {
  await db
    .from('entities')
    .update({ last_seen: new Date().toISOString() })
    .eq('id', entityId)
}

async function addAlias(
  db: SupabaseClient,
  entityId: string,
  alias: string,
  normalizedAlias: string
): Promise<void> {
  await db
    .from('entity_aliases')
    .upsert(
      { entity_id: entityId, alias, normalized_alias: normalizedAlias },
      { onConflict: 'normalized_alias,entity_id', ignoreDuplicates: true }
    )
}

async function createEntity(
  db: SupabaseClient,
  input: ClassifyEntityInput
): Promise<Entity> {
  const { data, error } = await db
    .from('entities')
    .insert({
      org_id: ORG_ID,
      type: input.type,
      name: input.name,
      normalized_name: normalize(input.name),
      metadata: input.metadata ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create entity: ${error.message}`)
  return data as Entity
}
