/**
 * Entity resolution logic.
 *
 * Resolution order (per spec):
 *   1. Claude-first — Claude sees existing entity names + IDs in system prompt,
 *      returns matched IDs or signals "new entity". Handled in ingest.ts.
 *   2. Alias lookup — check entity_aliases.normalized_alias
 *   3. DB fuzzy match — normalized_name exact, then pg_trgm
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
 * Claude either returns a matched_entity_id (known) or signals new entity (no id).
 *
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

  // Path 4: Fuzzy match via pg_trgm
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

async function findByAlias(db: SupabaseClient, normalizedAlias: string): Promise<Entity | null> {
  const { data } = await db
    .from('entity_aliases')
    .select('entity_id, entities(*)')
    .eq('normalized_alias', normalizedAlias)
    .eq('entities.org_id', ORG_ID)
    .limit(1)
    .single()

  if (!data) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any).entities as Entity
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
    .single()

  return data as Entity | null
}

async function findByFuzzy(
  db: SupabaseClient,
  name: string,
  type: string
): Promise<Entity | null> {
  // pg_trgm similarity search via RPC or raw query
  // Supabase doesn't expose trigram search natively, so we use a simple ILIKE approach
  // for v1. In production, add an RPC function for proper pg_trgm.
  const { data } = await db
    .from('entities')
    .select('*')
    .eq('org_id', ORG_ID)
    .eq('type', type)
    .ilike('name', `%${name.slice(0, 5)}%`)  // rough prefix match
    .limit(5)

  if (!data || data.length === 0) return null

  // Simple Jaccard-like: find best candidate
  const normalized = normalize(name)
  const best = (data as Entity[]).find(
    (e) => similarity(normalized, e.normalized_name) > 0.3
  )
  return best ?? null
}

/** Simple bigram similarity (approximates pg_trgm for client-side filtering) */
function similarity(a: string, b: string): number {
  if (a === b) return 1
  const bigrams = (s: string) => new Set(Array.from({ length: s.length - 1 }, (_, i) => s.slice(i, i + 2)))
  const ba = bigrams(a)
  const bb = bigrams(b)
  const intersection = [...ba].filter((x) => bb.has(x)).length
  return (2 * intersection) / (ba.size + bb.size)
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
