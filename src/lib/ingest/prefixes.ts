import type { ParsedPrefixes } from '@/types'

/**
 * Parse RECEIPT:, NOTE:, and PROJECT: prefixes from an email subject.
 * Prefixes are case-insensitive and can appear anywhere (survives Fwd:, Re:).
 * Order: each prefix captures text up to the next recognized prefix or end-of-subject.
 */
export function parsePrefixes(subject: string): ParsedPrefixes {
  const result: ParsedPrefixes = {
    isReceipt: false,
    note: null,
    projectName: null,
  }

  if (!subject) return result

  // Case-insensitive check for RECEIPT:
  result.isReceipt = /receipt:/i.test(subject)

  // Remove RECEIPT: (and any text immediately after it up to next prefix or space)
  // since RECEIPT: has no value to extract
  let cleaned = subject.replace(/receipt:\s*/gi, '')

  // Extract NOTE: value -- text after NOTE: up to next prefix or end
  const noteMatch = cleaned.match(/note:\s*(.*?)(?=\s*(?:project:|receipt:)|$)/i)
  if (noteMatch) {
    const noteText = noteMatch[1].trim()
    if (noteText) result.note = noteText
    cleaned = cleaned.replace(/note:\s*.*?(?=\s*(?:project:|receipt:)|$)/i, '')
  }

  // Extract PROJECT: value -- text after PROJECT: up to next prefix or end
  const projectMatch = cleaned.match(/project:\s*(.*?)(?=\s*(?:note:|receipt:)|$)/i)
  if (projectMatch) {
    const projectText = projectMatch[1].trim()
    if (projectText) result.projectName = projectText
  }

  return result
}
