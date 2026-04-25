/**
 * Ingestion pipeline — re-exports for backwards compatibility.
 *
 * Existing imports like `from '@/lib/ingest'` continue to work.
 */

export { processEntry } from './process'
export { ensureArray } from './resolve'
export { linkReplyToNudge, detectSource } from './compat'
export { parsePrefixes } from './prefixes'
export { uploadReceiptAttachments, extractReceiptMeta, saveReceipt } from './receipt'
