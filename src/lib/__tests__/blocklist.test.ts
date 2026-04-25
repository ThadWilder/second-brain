import { describe, it, expect } from 'vitest'
import { extractSenderEmail } from '../blocklist'

describe('extractSenderEmail', () => {
  it('extracts email from "Name <email>" format', () => {
    expect(extractSenderEmail('Brandy Murch <bmurch@thresholdbrands.com>'))
      .toBe('bmurch@thresholdbrands.com')
  })

  it('handles plain email', () => {
    expect(extractSenderEmail('bmurch@thresholdbrands.com'))
      .toBe('bmurch@thresholdbrands.com')
  })

  it('lowercases the email', () => {
    expect(extractSenderEmail('BMurch@ThresholdBrands.com'))
      .toBe('bmurch@thresholdbrands.com')
  })
})
