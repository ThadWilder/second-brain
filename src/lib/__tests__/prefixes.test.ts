import { describe, it, expect } from 'vitest'
import { parsePrefixes } from '../ingest/prefixes'

describe('parsePrefixes', () => {
  it('detects RECEIPT: prefix', () => {
    const result = parsePrefixes('RECEIPT: Uber ride')
    expect(result.isReceipt).toBe(true)
    expect(result.note).toBeNull()
    expect(result.projectName).toBeNull()
  })

  it('detects RECEIPT: case-insensitive', () => {
    expect(parsePrefixes('receipt: test').isReceipt).toBe(true)
    expect(parsePrefixes('Receipt: test').isReceipt).toBe(true)
  })

  it('detects RECEIPT: after Fwd:', () => {
    expect(parsePrefixes('Fwd: RECEIPT: Adobe invoice').isReceipt).toBe(true)
  })

  it('detects NOTE: prefix and extracts note text', () => {
    const result = parsePrefixes('NOTE: context for this email')
    expect(result.note).toBe('context for this email')
    expect(result.isReceipt).toBe(false)
  })

  it('detects PROJECT: prefix and extracts project name', () => {
    const result = parsePrefixes('PROJECT:Website Redesign')
    expect(result.projectName).toBe('Website Redesign')
  })

  it('handles multi-word project names', () => {
    const result = parsePrefixes('PROJECT:Q2 Marketing Campaign')
    expect(result.projectName).toBe('Q2 Marketing Campaign')
  })

  it('handles combined prefixes', () => {
    const result = parsePrefixes('RECEIPT: PROJECT:MaidPro')
    expect(result.isReceipt).toBe(true)
    expect(result.projectName).toBe('MaidPro')
  })

  it('handles NOTE + PROJECT combined', () => {
    const result = parsePrefixes('NOTE:needs follow-up PROJECT:Website Redesign')
    expect(result.note).toBe('needs follow-up')
    expect(result.projectName).toBe('Website Redesign')
  })

  it('handles all three combined', () => {
    const result = parsePrefixes('RECEIPT: NOTE:vendor invoice PROJECT:Q2 Campaign')
    expect(result.isReceipt).toBe(true)
    expect(result.note).toBe('vendor invoice')
    expect(result.projectName).toBe('Q2 Campaign')
  })

  it('returns empty result for normal subjects', () => {
    const result = parsePrefixes('Re: Weekly marketing meeting notes')
    expect(result.isReceipt).toBe(false)
    expect(result.note).toBeNull()
    expect(result.projectName).toBeNull()
  })

  it('trims whitespace from extracted values', () => {
    const result = parsePrefixes('NOTE:  lots of space  PROJECT:  My Project  ')
    expect(result.note).toBe('lots of space')
    expect(result.projectName).toBe('My Project')
  })
})
