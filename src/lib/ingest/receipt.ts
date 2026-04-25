import crypto from 'crypto'
import { anthropic, CLAUDE_MODEL } from '@/lib/claude'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import type { PostmarkAttachment } from '@/lib/postmark'
import type { Attachment, ReceiptMeta, ReceiptCategory } from '@/types'

// ─────────────────────────────────────────
// Constants
// ─────────────────────────────────────────

const ALLOWED_FILE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'application/pdf',
]

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

const ICON_KEYWORDS = ['logo', 'icon', 'favicon', 'sprite', 'badge', 'banner']

const ICON_CONTENT_TYPES = ['image/x-icon', 'image/vnd.microsoft.icon']

const VALID_CATEGORIES: ReceiptCategory[] = [
  'software', 'travel', 'meals', 'office_supplies',
  'advertising', 'services', 'subscriptions', 'equipment', 'other',
]

const VALID_BRANDS = [
  'MaidPro', 'USA Insulation', 'Pestmaster', 'Men In Kilts',
  'Mold Medics', 'Miracle Method', 'Granite Garage Floors',
  'PHP', 'HAP', 'PLP', 'Threshold HQ', 'TMS',
]

const NULL_RECEIPT_META: ReceiptMeta = {
  vendor: null,
  amount: null,
  date: null,
  payment_method: null,
  category: null,
  brand: null,
}

// ─────────────────────────────────────────
// isLikelyIcon
// ─────────────────────────────────────────

export function isLikelyIcon(att: PostmarkAttachment): boolean {
  const nameLower = att.Name.toLowerCase()
  if (ICON_KEYWORDS.some((kw) => nameLower.includes(kw))) return true
  if (ICON_CONTENT_TYPES.includes(att.ContentType)) return true

  // Decode base64 and check size
  const buffer = Buffer.from(att.Content, 'base64')
  if (buffer.byteLength < 10 * 1024) return true

  return false
}

// ─────────────────────────────────────────
// uploadReceiptAttachments
// ─────────────────────────────────────────

export async function uploadReceiptAttachments(
  attachments: PostmarkAttachment[]
): Promise<Attachment[]> {
  const db = getServiceClient()
  const results: Attachment[] = []

  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const folder = `receipts/${yyyy}-${mm}`

  for (const att of attachments) {
    if (!ALLOWED_FILE_TYPES.includes(att.ContentType)) continue
    if (isLikelyIcon(att)) continue

    const buffer = Buffer.from(att.Content, 'base64')
    if (buffer.byteLength > MAX_FILE_SIZE) continue

    const ext = att.Name.split('.').pop() ?? 'bin'
    const storagePath = `${folder}/${crypto.randomUUID()}.${ext}`

    const { error } = await db.storage
      .from('attachments')
      .upload(storagePath, buffer, {
        contentType: att.ContentType,
        upsert: false,
      })

    if (error) {
      console.error(`[receipt] Failed to upload attachment ${att.Name}:`, error.message)
      continue
    }

    const { data: urlData } = db.storage
      .from('attachments')
      .getPublicUrl(storagePath)

    results.push({
      url: urlData.publicUrl,
      type: att.ContentType,
      filename: att.Name,
    })
  }

  return results
}

// ─────────────────────────────────────────
// extractReceiptMeta
// ─────────────────────────────────────────

export async function extractReceiptMeta(
  emailText: string,
  attachments: Attachment[]
): Promise<ReceiptMeta> {
  try {
    // Build content as plain text only — the SDK version in use (0.20.x) does not
    // support URL-sourced images. Image filenames/URLs are included in text so
    // Claude knows attachments are present.
    const imageAttachments = attachments.filter((a) =>
      a.type.startsWith('image/')
    )

    const parts: string[] = []

    if (emailText.trim()) {
      parts.push(`Email content:\n${emailText}`)
    }

    if (imageAttachments.length > 0) {
      parts.push(
        `Attached images: ${imageAttachments.map((a) => a.filename).join(', ')}`
      )
    }

    const content = parts.join('\n\n')

    const prompt = `${content}

Extract receipt information from the above email content. Return a JSON object with these exact fields:
- vendor: string or null (merchant/company name)
- amount: number or null (total amount paid, as a number)
- date: string or null (ISO 8601 date, e.g. "2024-03-15")
- payment_method: string or null (e.g. "Visa ending 4242", "PayPal", "ACH")
- category: one of [${VALID_CATEGORIES.join(', ')}] or null
- brand: one of [${VALID_BRANDS.join(', ')}] or null (which Threshold brand this expense is for)

Return ONLY the JSON object, no additional text.`

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') return NULL_RECEIPT_META

    const raw = textBlock.text.trim()
    // Strip markdown code fences if present
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    const parsed = JSON.parse(jsonStr) as Partial<ReceiptMeta>

    return {
      vendor: typeof parsed.vendor === 'string' ? parsed.vendor : null,
      amount: typeof parsed.amount === 'number' ? parsed.amount : null,
      date: typeof parsed.date === 'string' ? parsed.date : null,
      payment_method: typeof parsed.payment_method === 'string' ? parsed.payment_method : null,
      category: VALID_CATEGORIES.includes(parsed.category as ReceiptCategory)
        ? (parsed.category as ReceiptCategory)
        : null,
      brand: VALID_BRANDS.includes(parsed.brand as string) ? (parsed.brand as string) : null,
    }
  } catch (err) {
    console.error('[receipt] extractReceiptMeta failed:', err)
    return NULL_RECEIPT_META
  }
}

// ─────────────────────────────────────────
// saveReceipt
// ─────────────────────────────────────────

export async function saveReceipt(
  entryId: string,
  meta: ReceiptMeta,
  attachments: Attachment[]
): Promise<{ id: string }> {
  const db = getServiceClient()

  const primaryFile = attachments[0] ?? null
  const url = primaryFile ? primaryFile.url : `receipt:${entryId}`
  const fileUrl = primaryFile ? primaryFile.url : null
  const fileType = primaryFile ? primaryFile.type : null

  const { data, error } = await db
    .from('saved_links')
    .upsert(
      {
        org_id: ORG_ID,
        url,
        type: 'receipt',
        receipt_meta: meta,
        file_url: fileUrl,
        file_type: fileType,
        entry_id: entryId,
      },
      { onConflict: 'org_id,url' }
    )
    .select('id')
    .single()

  if (error) {
    console.error('[receipt] saveReceipt upsert failed:', error.message)
    throw error
  }

  return { id: data.id }
}
