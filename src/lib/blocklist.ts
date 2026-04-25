import { getServiceClient, ORG_ID } from '@/lib/supabase'
import type { BlocklistEntry } from '@/types'

/** Extract clean email address from Postmark "Name <email>" format */
export function extractSenderEmail(from: string): string {
  const match = from.match(/<([^>]+)>/)
  return (match ? match[1] : from).trim().toLowerCase()
}

/** Check if sender is blocklisted. Returns true if blocked. */
export async function isBlocklisted(senderEmail: string): Promise<boolean> {
  const db = getServiceClient()

  const { data } = await db
    .from('blocklist')
    .select('id')
    .eq('org_id', ORG_ID)
    .eq('type', 'sender')
    .eq('pattern', senderEmail)
    .limit(1)

  return (data ?? []).length > 0
}

/** Check if a specific URL is blocklisted */
export async function isUrlBlocklisted(url: string): Promise<boolean> {
  const db = getServiceClient()

  const { data } = await db
    .from('blocklist')
    .select('id')
    .eq('org_id', ORG_ID)
    .eq('type', 'url')
    .eq('pattern', url)
    .limit(1)

  return (data ?? []).length > 0
}

/** Add a pattern to the blocklist */
export async function addToBlocklist(
  pattern: string,
  type: 'url' | 'sender'
): Promise<BlocklistEntry> {
  const db = getServiceClient()

  const { data, error } = await db
    .from('blocklist')
    .insert({ org_id: ORG_ID, pattern, type })
    .select()
    .single()

  if (error) throw new Error(`Failed to add to blocklist: ${error.message}`)
  return data as BlocklistEntry
}

/** Remove from blocklist */
export async function removeFromBlocklist(id: string): Promise<void> {
  const db = getServiceClient()
  await db.from('blocklist').delete().eq('id', id).eq('org_id', ORG_ID)
}

/** List all blocklist entries */
export async function listBlocklist(): Promise<BlocklistEntry[]> {
  const db = getServiceClient()

  const { data } = await db
    .from('blocklist')
    .select('*')
    .eq('org_id', ORG_ID)
    .order('created_at', { ascending: false })

  return (data ?? []) as BlocklistEntry[]
}
