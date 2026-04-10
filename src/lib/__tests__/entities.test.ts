/**
 * Entity resolution tests — covers the three fixed paths:
 *   1. Alias lookup (two-step join fix)
 *   2. Trigram fuzzy matching
 *   3. Cross-type fallback
 *
 * Uses a mock Supabase client to isolate DB logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  normalize,
  trigramSimilarity,
  buildEntityContext,
  resolveOrCreateEntity,
} from '../entities'
import type { Entity, ClassifyEntityInput } from '@/types'

// ─────────────────────────────────────────
// Pure function tests (no mocks needed)
// ─────────────────────────────────────────

describe('normalize', () => {
  it('lowercases', () => {
    expect(normalize('MaidPro')).toBe('maidpro')
  })

  it('trims whitespace', () => {
    expect(normalize('  Moe  ')).toBe('moe')
  })

  it('collapses internal whitespace', () => {
    expect(normalize('Red   Brick')).toBe('red brick')
  })

  it('handles all three at once', () => {
    expect(normalize('  Men  In   Kilts  ')).toBe('men in kilts')
  })
})

describe('trigramSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(trigramSimilarity('moe', 'moe')).toBe(1)
  })

  it('returns 0 for empty strings', () => {
    expect(trigramSimilarity('', 'moe')).toBe(0)
    expect(trigramSimilarity('moe', '')).toBe(0)
  })

  it('scores "maidpro" vs "maid pro" high (>0.3)', () => {
    const score = trigramSimilarity('maidpro', 'maid pro')
    expect(score).toBeGreaterThan(0.3)
  })

  it('scores "red brick" vs "red brick media" high (>0.3)', () => {
    const score = trigramSimilarity('red brick', 'red brick media')
    expect(score).toBeGreaterThan(0.3)
  })

  it('scores "moe" vs "moe seo" reasonably (>0.15)', () => {
    // Short names have lower trigram overlap but containment check handles it
    const score = trigramSimilarity('moe', 'moe seo')
    expect(score).toBeGreaterThan(0.15)
  })

  it('scores completely unrelated strings low (<0.1)', () => {
    const score = trigramSimilarity('maidpro', 'pestmaster')
    expect(score).toBeLessThan(0.1)
  })

  it('scores "miracle method" vs "miracle" reasonably', () => {
    const score = trigramSimilarity('miracle method', 'miracle')
    expect(score).toBeGreaterThan(0.2)
  })
})

describe('buildEntityContext', () => {
  it('groups entities by type with IDs', () => {
    const entities: Entity[] = [
      makeEntity({ id: 'b1', type: 'brand', name: 'MaidPro' }),
      makeEntity({ id: 'v1', type: 'vendor', name: 'Moe' }),
    ]
    const result = buildEntityContext(entities)
    expect(result).toContain('BRAND: MaidPro [id:b1]')
    expect(result).toContain('VENDOR: Moe [id:v1]')
  })

  it('returns empty-ish string for no entities', () => {
    expect(buildEntityContext([])).toBe('')
  })
})

// ─────────────────────────────────────────
// resolveOrCreateEntity — mock Supabase
// ─────────────────────────────────────────

const MOE_VENDOR = makeEntity({
  id: 'moe-uuid',
  type: 'vendor',
  name: 'Moe',
  normalized_name: 'moe',
})

const RED_BRICK = makeEntity({
  id: 'rb-uuid',
  type: 'vendor',
  name: 'Red Brick',
  normalized_name: 'red brick',
})

const MAIDPRO = makeEntity({
  id: 'mp-uuid',
  type: 'brand',
  name: 'MaidPro',
  normalized_name: 'maidpro',
})

const DUSTIN = makeEntity({
  id: 'dustin-uuid',
  type: 'contact',
  name: 'Dustin',
  normalized_name: 'dustin',
})

const ALL_ENTITIES = [MOE_VENDOR, RED_BRICK, MAIDPRO, DUSTIN]

// ─── Mock Supabase builder chain ──────────────────────────────────────

function createMockDb(opts: {
  aliasLookup?: Record<string, string>  // normalized_alias → entity_id
}) {
  const { aliasLookup = {} } = opts

  function chainable(resolvedData: unknown) {
    const chain: Record<string, Function> = {}
    const methods = ['select', 'eq', 'in', 'ilike', 'limit', 'order', 'single', 'maybeSingle', 'insert', 'update', 'upsert']

    for (const method of methods) {
      chain[method] = vi.fn().mockReturnValue(chain)
    }

    // Terminal methods return data
    chain.single = vi.fn().mockResolvedValue({ data: resolvedData, error: null })
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: resolvedData, error: null })

    return chain
  }

  const db = {
    from: vi.fn((table: string) => {
      if (table === 'entity_aliases') {
        // Alias lookup — return entity_id if alias exists
        const aliasChain: Record<string, Function> = {}
        const aliasMethods = ['select', 'eq', 'limit', 'single', 'maybeSingle']
        for (const m of aliasMethods) {
          aliasChain[m] = vi.fn().mockReturnValue(aliasChain)
        }

        // Track which alias was queried
        let queriedAlias = ''
        const origEq = aliasChain.eq as ReturnType<typeof vi.fn>
        aliasChain.eq = vi.fn((_col: string, val: string) => {
          if (_col === 'normalized_alias') queriedAlias = val
          return aliasChain
        })

        aliasChain.maybeSingle = vi.fn(() => {
          const entityId = aliasLookup[queriedAlias]
          return Promise.resolve({
            data: entityId ? { entity_id: entityId } : null,
            error: null,
          })
        })

        return aliasChain
      }

      if (table === 'entities') {
        let filters: Record<string, string> = {}

        const entChain: Record<string, Function> = {}
        const entMethods = ['select', 'eq', 'limit', 'order', 'single', 'maybeSingle', 'insert', 'update', 'upsert']
        for (const m of entMethods) {
          entChain[m] = vi.fn().mockReturnValue(entChain)
        }

        entChain.eq = vi.fn((_col: string, val: string) => {
          filters[_col] = val
          return entChain
        })

        // For select() without terminal, return the chain
        entChain.select = vi.fn().mockReturnValue(entChain)

        // single() — used by getEntityById
        entChain.single = vi.fn(() => {
          let match: Entity | undefined
          if (filters['id']) {
            match = ALL_ENTITIES.find((e) => e.id === filters['id'])
          }
          return Promise.resolve({ data: match ?? null, error: null })
        })

        // maybeSingle() — used by findByNormalizedName, findByNormalizedNameAnyType
        entChain.maybeSingle = vi.fn(() => {
          let match: Entity | undefined
          if (filters['normalized_name'] && filters['type']) {
            match = ALL_ENTITIES.find(
              (e) => e.normalized_name === filters['normalized_name'] && e.type === filters['type']
            )
          } else if (filters['normalized_name']) {
            match = ALL_ENTITIES.find((e) => e.normalized_name === filters['normalized_name'])
          } else if (filters['id']) {
            match = ALL_ENTITIES.find((e) => e.id === filters['id'])
          }
          filters = {}
          return Promise.resolve({ data: match ?? null, error: null })
        })

        // For findByFuzzy — returns all entities of type (no terminal, returns {data})
        const origSelectFn = entChain.select as ReturnType<typeof vi.fn>
        entChain.select = vi.fn(() => {
          // Return chain, but also make it thenable
          const result = { ...entChain }
          ;(result as any).then = (resolve: Function) => {
            const typeFilter = filters['type']
            const data = typeFilter
              ? ALL_ENTITIES.filter((e) => e.type === typeFilter)
              : ALL_ENTITIES
            filters = {}
            return resolve({ data, error: null })
          }
          return result
        })

        // Insert for createEntity
        entChain.insert = vi.fn((row: Record<string, unknown>) => {
          const newEntity = makeEntity({
            id: 'new-' + Math.random().toString(36).slice(2, 8),
            type: row.type as string,
            name: row.name as string,
            normalized_name: row.normalized_name as string,
          })
          return {
            select: () => ({
              single: () => Promise.resolve({ data: newEntity, error: null }),
            }),
          }
        })

        // Update for updateLastSeen
        entChain.update = vi.fn().mockReturnValue(entChain)

        return entChain
      }

      // Default — return a no-op chain
      return chainable(null)
    }),
  }

  return db as unknown as ReturnType<typeof vi.fn> & { from: ReturnType<typeof vi.fn> }
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('resolveOrCreateEntity', () => {

  describe('Path 1: Claude-matched entity ID', () => {
    it('returns existing entity when matched_entity_id is valid', async () => {
      const db = createMockDb({})

      // Override to make getEntityById work
      db.from = vi.fn((table: string) => {
        if (table === 'entities') {
          return {
            select: () => ({
              eq: (_: string, id: string) => ({
                single: () => Promise.resolve({
                  data: ALL_ENTITIES.find((e) => e.id === id) ?? null,
                  error: null,
                }),
                eq: (_: string, __: string) => ({
                  single: () => Promise.resolve({
                    data: ALL_ENTITIES.find((e) => e.id === id) ?? null,
                    error: null,
                  }),
                }),
              }),
            }),
            update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          }
        }
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }
      }) as any

      const result = await resolveOrCreateEntity(db as any, {
        name: 'Moe',
        type: 'vendor',
        matched_entity_id: 'moe-uuid',
      })

      expect(result.id).toBe('moe-uuid')
      expect(result.name).toBe('Moe')
    })
  })

  describe('Path 2: Alias lookup (two-step join fix)', () => {
    it('resolves "moe seo" → Moe vendor via alias', async () => {
      // Simulate: entity_aliases has "moe seo" → moe-uuid
      const db = createMockDb({ aliasLookup: { 'moe seo': 'moe-uuid' } })

      // Override entities.from for the entity fetch after alias match
      const origFrom = db.from
      db.from = vi.fn((table: string) => {
        if (table === 'entity_aliases') {
          return origFrom(table)
        }
        if (table === 'entities') {
          return {
            select: () => ({
              eq: (_: string, val: string) => ({
                eq: (_: string, __: string) => ({
                  single: () => Promise.resolve({
                    data: ALL_ENTITIES.find((e) => e.id === val) ?? null,
                    error: null,
                  }),
                }),
                single: () => Promise.resolve({
                  data: ALL_ENTITIES.find((e) => e.id === val) ?? null,
                  error: null,
                }),
              }),
            }),
            update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          }
        }
        return origFrom(table)
      }) as any

      const result = await resolveOrCreateEntity(db as any, {
        name: 'Moe SEO',
        type: 'vendor',
      })

      expect(result.id).toBe('moe-uuid')
      expect(result.name).toBe('Moe')
    })

    it('returns null from alias lookup when alias does not exist', async () => {
      const db = createMockDb({ aliasLookup: {} })

      // This should fall through alias → exact match → etc.
      // Override to support the full chain
      const origFrom = db.from
      db.from = vi.fn((table: string) => {
        if (table === 'entity_aliases') return origFrom(table)
        if (table === 'entities') {
          return {
            select: () => ({
              eq: (_col: string, val: string) => {
                // For normalized_name exact match
                if (_col === 'org_id') {
                  return {
                    eq: (_col2: string, val2: string) => {
                      if (_col2 === 'type') {
                        return {
                          eq: (_col3: string, val3: string) => ({
                            maybeSingle: () => {
                              const match = ALL_ENTITIES.find(
                                (e) => e.normalized_name === val3 && e.type === val2
                              )
                              return Promise.resolve({ data: match ?? null, error: null })
                            },
                          }),
                        }
                      }
                      // Cross-type: just normalized_name
                      return {
                        limit: () => ({
                          maybeSingle: () => {
                            const match = ALL_ENTITIES.find((e) => e.normalized_name === val2)
                            return Promise.resolve({ data: match ?? null, error: null })
                          },
                        }),
                        eq: (_col3: string, val3: string) => ({
                          maybeSingle: () => {
                            const match = ALL_ENTITIES.find(
                              (e) => e.normalized_name === val3 && e.type === val2
                            )
                            return Promise.resolve({ data: match ?? null, error: null })
                          },
                        }),
                      }
                    },
                  }
                }
                return { single: () => Promise.resolve({ data: null, error: null }) }
              },
            }),
            update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          }
        }
        return origFrom(table)
      }) as any

      // "Dustin" should resolve via exact normalized_name match
      const result = await resolveOrCreateEntity(db as any, {
        name: 'Dustin',
        type: 'contact',
      })

      expect(result.id).toBe('dustin-uuid')
    })
  })

  describe('Path 3b: Cross-type fallback', () => {
    it('resolves "Moe" classified as contact to existing vendor', async () => {
      const db = createMockDb({ aliasLookup: {} })

      const origFrom = db.from
      db.from = vi.fn((table: string) => {
        if (table === 'entity_aliases') return origFrom(table)
        if (table === 'entities') {
          let filters: Record<string, string> = {}
          return {
            select: () => {
              const chain: Record<string, Function> = {}
              chain.eq = (_col: string, val: string) => {
                filters[_col] = val
                return chain
              }
              chain.limit = () => chain
              chain.maybeSingle = () => {
                const type = filters['type']
                const nn = filters['normalized_name']
                let match: Entity | undefined

                if (nn && type) {
                  // Same-type exact match — "moe" as contact → no match
                  match = ALL_ENTITIES.find((e) => e.normalized_name === nn && e.type === type)
                } else if (nn) {
                  // Cross-type fallback — "moe" any type → finds vendor
                  match = ALL_ENTITIES.find((e) => e.normalized_name === nn)
                }

                filters = {}
                return Promise.resolve({ data: match ?? null, error: null })
              }
              return chain
            },
            update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          }
        }
        return origFrom(table)
      }) as any

      // Claude misclassified Moe as "contact" but they exist as "vendor"
      const result = await resolveOrCreateEntity(db as any, {
        name: 'Moe',
        type: 'contact',  // wrong type
      })

      expect(result.id).toBe('moe-uuid')
      expect(result.type).toBe('vendor')  // resolved to correct type
    })
  })
})

// ─── Trigram fuzzy matching (pure function, thorough) ─────────────────

describe('trigramSimilarity — fuzzy match cases', () => {
  it('"moe seo" containment handled by findByFuzzy, not trigrams alone', () => {
    // Raw trigram score for "moe" vs "moe seo" is low
    const score = trigramSimilarity('moe', 'moe seo')
    // But the containment check in findByFuzzy would catch it
    // This test documents the trigram score is intentionally low
    expect(score).toBeLessThan(0.5)
    expect(score).toBeGreaterThan(0)
  })

  it('"red brick" vs "red brick" = 1', () => {
    expect(trigramSimilarity('red brick', 'red brick')).toBe(1)
  })

  it('"maidpro" vs "maid pro" is high', () => {
    expect(trigramSimilarity('maidpro', 'maid pro')).toBeGreaterThan(0.35)
  })

  it('"pestmaster" vs "pest master" is high', () => {
    expect(trigramSimilarity('pestmaster', 'pest master')).toBeGreaterThan(0.35)
  })

  it('"miracle method" vs "miraclemethod" is high', () => {
    expect(trigramSimilarity('miracle method', 'miraclemethod')).toBeGreaterThan(0.35)
  })

  it('completely different strings score near 0', () => {
    expect(trigramSimilarity('maidpro', 'red brick')).toBeLessThan(0.1)
  })

  it('handles single character strings', () => {
    expect(trigramSimilarity('a', 'a')).toBe(1)
    expect(trigramSimilarity('a', 'b')).toBeLessThan(0.5)
  })
})

// ─── Helpers ──────────────────────────────────────────────────────────

function makeEntity(overrides: Partial<Entity> & { id: string; type: string; name: string }): Entity {
  return {
    org_id: '00000000-0000-0000-0000-000000000001',
    normalized_name: normalize(overrides.name),
    metadata: null,
    first_seen: '2026-04-09T00:00:00Z',
    last_seen: '2026-04-09T00:00:00Z',
    created_at: '2026-04-09T00:00:00Z',
    ...overrides,
  }
}
