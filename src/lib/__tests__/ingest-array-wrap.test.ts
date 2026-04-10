/**
 * Regression test for: "input.tasks is not iterable"
 *
 * Claude sometimes returns a single object instead of an array for
 * tool_use inputs (tasks, entities, decisions). The ensureArray utility
 * normalises these into arrays so the pipeline doesn't crash.
 */

import { describe, it, expect } from 'vitest'
import { ensureArray } from '../ingest'

describe('ensureArray — single-object wrapping regression', () => {
  // ── Single objects (the bug case) ──────────────────────

  it('wraps a single task object into an array', () => {
    const input = { description: 'single task', due_date: null } as const
    const result = ensureArray(input)
    expect(result).toEqual([input])
  })

  it('wraps a single entity object into an array', () => {
    const input = { name: 'Joe', type: 'contact' } as const
    const result = ensureArray(input)
    expect(result).toEqual([input])
  })

  it('wraps a single decision object into an array', () => {
    const input = { summary: 'decided X', made_by: 'Alice' } as const
    const result = ensureArray(input)
    expect(result).toEqual([input])
  })

  // ── Already-array inputs (normal path) ─────────────────

  it('passes through an array of tasks unchanged', () => {
    const input = [
      { description: 'task1' },
      { description: 'task2' },
    ]
    expect(ensureArray(input)).toBe(input) // same reference
  })

  it('passes through an array of entities unchanged', () => {
    const input = [{ name: 'Joe', type: 'contact' }]
    expect(ensureArray(input)).toBe(input)
  })

  it('passes through an empty array', () => {
    const input: unknown[] = []
    expect(ensureArray(input)).toBe(input)
  })

  // ── Null / undefined / missing (defensive) ────────────

  it('returns [] for null', () => {
    expect(ensureArray(null)).toEqual([])
  })

  it('returns [] for undefined', () => {
    expect(ensureArray(undefined)).toEqual([])
  })

  // ── Primitive edge cases ───────────────────────────────

  it('wraps a string into an array', () => {
    expect(ensureArray('hello')).toEqual(['hello'])
  })

  it('wraps a number into an array', () => {
    expect(ensureArray(42)).toEqual([42])
  })
})
