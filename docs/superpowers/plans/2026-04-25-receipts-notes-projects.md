# Receipts, Notes, Projects + Resource Library Enhancements

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `RECEIPT:`, `NOTE:`, `PROJECT:` email prefix commands, display receipts in Resource Library with blocklist and bulk actions, and introduce Projects as a new entity type.

**Architecture:** Extends the existing Postmark ingest pipeline with prefix detection and branching logic. Receipts bypass task extraction and land in the `saved_links` table. Projects reuse the entity system. Blocklist table checked early in ingest to silently drop known-bad senders/URLs.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + Storage), Anthropic Claude API (Sonnet 4.5), Postmark, TypeScript, Tailwind CSS, Vitest

**Spec:** `docs/superpowers/specs/2026-04-25-receipt-ingestion-resource-library-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/028_receipts_blocklist_projects.sql` | Schema changes: saved_links columns, blocklist table, task_entities constraint, saved_links RLS |
| `src/lib/ingest/prefixes.ts` | Parse `RECEIPT:`, `NOTE:`, `PROJECT:` from email subjects |
| `src/lib/ingest/receipt.ts` | Receipt-specific pipeline: upload files, call Claude for extraction, save to saved_links |
| `src/lib/blocklist.ts` | Blocklist check + management functions |
| `src/app/api/blocklist/route.ts` | CRUD API for blocklist entries |
| `src/app/projects/page.tsx` | Projects list page |
| `src/app/projects/[id]/page.tsx` | Project detail page |
| `src/app/api/projects/route.ts` | Projects API (list, create) |
| `src/lib/__tests__/prefixes.test.ts` | Prefix parsing tests |
| `src/lib/__tests__/receipt.test.ts` | Receipt extraction tests |
| `src/lib/__tests__/blocklist.test.ts` | Blocklist logic tests |

### Modified Files
| File | Changes |
|------|---------|
| `src/app/api/ingest/route.ts` | Blocklist check, prefix detection, receipt branch, NOTE/PROJECT handling, PDF uploads, maxDuration bump |
| `src/app/api/links/route.ts` | Receipt columns in query, `?kind` param, `?category` rename, receipt CRUD |
| `src/app/links/page.tsx` | Filter tabs (All/Links/Receipts), receipt cards, bulk selection, blocklist UI, icon filtering |
| `src/lib/ingest/extract.ts` | Receipt extraction Claude tools/prompt |
| `src/lib/ingest/resolve.ts` | Project entity detection in system prompt |
| `src/types/index.ts` | Receipt types, blocklist types, project metadata type |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/028_receipts_blocklist_projects.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 028: Receipts, blocklist, projects support

-- ── saved_links: add receipt columns ────────────────────────────
ALTER TABLE saved_links ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'link';
ALTER TABLE saved_links ADD COLUMN IF NOT EXISTS receipt_meta jsonb;
ALTER TABLE saved_links ADD COLUMN IF NOT EXISTS file_url text;
ALTER TABLE saved_links ADD COLUMN IF NOT EXISTS file_type text;
ALTER TABLE saved_links ADD COLUMN IF NOT EXISTS entry_id uuid REFERENCES entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_saved_links_type ON saved_links (org_id, type);

-- ── saved_links: enable RLS (pre-existing gap) ─────────────────
ALTER TABLE saved_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY saved_links_org_policy ON saved_links
  FOR ALL USING (org_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- ── blocklist table ─────��───────────────────────────────────────
CREATE TABLE IF NOT EXISTS blocklist (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL,
  pattern text NOT NULL,
  type text NOT NULL CHECK (type IN ('url', 'sender')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blocklist_org_lookup ON blocklist (org_id, type, pattern);

ALTER TABLE blocklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY blocklist_org_policy ON blocklist
  FOR ALL USING (org_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- ── task_entities: add 'project' role ───────────��───────────────
ALTER TABLE task_entities DROP CONSTRAINT IF EXISTS task_entities_role_check;
ALTER TABLE task_entities ADD CONSTRAINT task_entities_role_check
  CHECK (role IN ('brand', 'assigned_to', 'vendor', 'topic', 'related', 'project'));
```

- [ ] **Step 2: Apply migration to Supabase**

Run the SQL via Supabase Dashboard SQL Editor or:
```bash
# If using supabase CLI:
cd /Users/brandym/second-brain
npx supabase db push
```

Verify: check that `saved_links` has `type`, `receipt_meta`, `file_url`, `file_type`, `entry_id` columns. Check `blocklist` table exists. Check `task_entities` constraint includes `project` and `related`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/028_receipts_blocklist_projects.sql
git commit -m "feat: migration 028 -- receipts, blocklist, projects schema"
```

---

## Task 2: Type Definitions

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add receipt and blocklist types**

Add to `src/types/index.ts`:

```typescript
// ── Receipt types ─────��─────────────────────────────────────────
export type ReceiptCategory =
  | 'software' | 'travel' | 'meals' | 'office_supplies'
  | 'advertising' | 'services' | 'subscriptions' | 'equipment' | 'other'

export interface ReceiptMeta {
  vendor: string | null
  amount: number | null
  date: string | null          // ISO 8601
  payment_method: string | null
  category: ReceiptCategory | null
  brand: string | null
}

export interface SavedLink {
  id: string
  org_id: string
  url: string
  label: string | null
  category: string | null
  brand_entity_id: string | null
  hidden: boolean
  pinned: boolean
  type: 'link' | 'receipt'
  receipt_meta: ReceiptMeta | null
  file_url: string | null
  file_type: string | null
  entry_id: string | null
  created_at: string
}

// ── Blocklist types ───────────────────────────────────��─────────
export type BlocklistType = 'url' | 'sender'

export interface BlocklistEntry {
  id: string
  org_id: string
  pattern: string
  type: BlocklistType
  created_at: string
}

// ── Project metadata (stored in entities.metadata) ──────────────
export type ProjectStatus = 'active' | 'completed' | 'on_hold'

export interface ProjectMeta {
  status: ProjectStatus
  description?: string
  target_date?: string  // ISO 8601
}

// ── Parsed email prefixes ───────────��───────────────────────────
export interface ParsedPrefixes {
  isReceipt: boolean
  note: string | null
  projectName: string | null
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add receipt, blocklist, project types"
```

---

## Task 3: Prefix Parsing

**Files:**
- Create: `src/lib/ingest/prefixes.ts`
- Create: `src/lib/__tests__/prefixes.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/__tests__/prefixes.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/brandym/second-brain
npx vitest run src/lib/__tests__/prefixes.test.ts
```
Expected: FAIL -- module not found

- [ ] **Step 3: Implement prefix parser**

```typescript
// src/lib/ingest/prefixes.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/brandym/second-brain
npx vitest run src/lib/__tests__/prefixes.test.ts
```
Expected: all PASS

- [ ] **Step 5: Export from ingest index**

Add to `src/lib/ingest/index.ts`:
```typescript
export { parsePrefixes } from './prefixes'
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/ingest/prefixes.ts src/lib/__tests__/prefixes.test.ts src/lib/ingest/index.ts
git commit -m "feat: prefix parser for RECEIPT:, NOTE:, PROJECT: in email subjects"
```

---

## Task 4: Blocklist Logic

**Files:**
- Create: `src/lib/blocklist.ts`
- Create: `src/lib/__tests__/blocklist.test.ts`
- Create: `src/app/api/blocklist/route.ts`

- [ ] **Step 1: Write blocklist utility tests**

```typescript
// src/lib/__tests__/blocklist.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/__tests__/blocklist.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement blocklist module**

```typescript
// src/lib/blocklist.ts
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import type { BlocklistEntry } from '@/types'

/** Extract clean email address from Postmark "Name <email>" format */
export function extractSenderEmail(from: string): string {
  const match = from.match(/<([^>]+)>/)
  return (match ? match[1] : from).trim().toLowerCase()
}

/** Check if sender or any URL is blocklisted. Returns true if blocked. */
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/__tests__/blocklist.test.ts
```
Expected: PASS (extractSenderEmail is pure, no DB needed)

- [ ] **Step 5: Create blocklist API route**

```typescript
// src/app/api/blocklist/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { hasValidSession } from '@/lib/auth'
import { addToBlocklist, removeFromBlocklist, listBlocklist } from '@/lib/blocklist'

export async function GET(): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const entries = await listBlocklist()
  return NextResponse.json({ entries })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { pattern, type } = await req.json()
  if (!pattern || !type || !['url', 'sender'].includes(type)) {
    return NextResponse.json({ error: 'pattern and type (url|sender) required' }, { status: 400 })
  }

  const entry = await addToBlocklist(pattern, type)
  return NextResponse.json({ entry })
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await removeFromBlocklist(id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/blocklist.ts src/lib/__tests__/blocklist.test.ts src/app/api/blocklist/route.ts
git commit -m "feat: blocklist module and API route"
```

---

## Task 5: Update classify_entities Tool Schema

**Files:**
- Modify: `src/lib/ingest/extract.ts`

- [ ] **Step 1: Add 'project' to the entity type enum**

In `src/lib/ingest/extract.ts`, line 33, update the `classify_entities` tool's entity type enum:

```typescript
enum: ['brand', 'department', 'franchisee', 'contact', 'vendor', 'vendor_team', 'freelancer', 'project'],
description: 'brand=franchise brands, department=internal teams (TMS/HQ), franchisee=franchise owners, contact=team members, vendor=external companies, vendor_team=people at vendors, freelancer=independent contractors, project=ongoing initiatives or campaigns.',
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/ingest/extract.ts
git commit -m "feat: add project to classify_entities tool enum"
```

---

## Task 6: Receipt Upload + Extraction

**Files:**
- Create: `src/lib/ingest/receipt.ts`
- Modify: `src/app/api/ingest/route.ts`

- [ ] **Step 1: Create receipt processing module**

```typescript
// src/lib/ingest/receipt.ts
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { anthropic, CLAUDE_MODEL } from '@/lib/claude'
import type { PostmarkAttachment } from '@/lib/postmark'
import type { ReceiptMeta, Attachment } from '@/types'
import crypto from 'crypto'

const ALLOWED_FILE_TYPES = [
  'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp',
  'application/pdf',
]

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

/** Filter out icons, logos, favicons from attachments */
function isLikelyIcon(att: PostmarkAttachment): boolean {
  const name = (att.Name ?? '').toLowerCase()
  const iconPatterns = ['logo', 'icon', 'favicon', 'sprite', 'badge', 'banner']
  if (iconPatterns.some(p => name.includes(p))) return true

  // Skip tiny images (likely icons/logos)
  const sizeBytes = att.Content ? Buffer.from(att.Content, 'base64').length : 0
  if (sizeBytes < 10240) return true // < 10KB

  // Skip icon MIME types
  if (att.ContentType === 'image/x-icon' || att.ContentType === 'image/vnd.microsoft.icon') return true

  return false
}

/** Upload receipt attachments to Supabase Storage */
export async function uploadReceiptAttachments(
  attachments: PostmarkAttachment[]
): Promise<Attachment[]> {
  const db = getServiceClient()
  const results: Attachment[] = []
  const now = new Date()
  const datePath = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  for (const att of attachments) {
    if (!ALLOWED_FILE_TYPES.includes(att.ContentType)) continue
    if (isLikelyIcon(att)) continue

    const buffer = Buffer.from(att.Content, 'base64')
    if (buffer.length > MAX_FILE_SIZE) continue

    const ext = att.Name.split('.').pop() ?? 'bin'
    const storagePath = `receipts/${datePath}/${crypto.randomUUID()}.${ext}`

    const { error } = await db.storage
      .from('attachments')
      .upload(storagePath, buffer, {
        contentType: att.ContentType,
        upsert: false,
      })

    if (error) {
      console.error(`Failed to upload receipt attachment ${att.Name}:`, error.message)
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

/** Call Claude to extract receipt metadata from email text + attachments */
export async function extractReceiptMeta(
  emailText: string,
  attachments: Attachment[]
): Promise<ReceiptMeta> {
  const content: Array<{ type: string; text?: string; source?: object }> = []

  content.push({
    type: 'text',
    text: `Extract receipt/invoice details from this email. Return a JSON object with these fields:
- vendor (string): merchant or service name
- amount (number): total amount in dollars (just the number, no $ sign)
- date (string): purchase date in YYYY-MM-DD format
- payment_method (string or null): e.g. "Visa ending 4521"
- category (string): one of: software, travel, meals, office_supplies, advertising, services, subscriptions, equipment, other
- brand (string or null): which brand this expense is for (MaidPro, USA Insulation, Pestmaster, Men In Kilts, Mold Medics, Miracle Method, Granite Garage Floors, PHP, HAP, PLP, Threshold HQ, TMS) -- infer from context if possible

If you cannot determine a field, set it to null. Return ONLY the JSON object, no markdown.

Email text:
${emailText}`,
  })

  // Include image attachments for Claude vision
  for (const att of attachments) {
    if (att.type.startsWith('image/')) {
      content.push({
        type: 'image',
        source: {
          type: 'url',
          url: att.url,
        },
      })
    }
  }

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: content as any }],
    })

    const text = response.content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('')

    // Parse JSON from response (handle potential markdown wrapping)
    const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(jsonStr)

    return {
      vendor: parsed.vendor ?? null,
      amount: typeof parsed.amount === 'number' ? parsed.amount : null,
      date: parsed.date ?? null,
      payment_method: parsed.payment_method ?? null,
      category: parsed.category ?? null,
      brand: parsed.brand ?? null,
    }
  } catch (err) {
    console.error('Receipt extraction failed:', err)
    return {
      vendor: null,
      amount: null,
      date: null,
      payment_method: null,
      category: null,
      brand: null,
    }
  }
}

/** Save receipt to saved_links table */
export async function saveReceipt(
  entryId: string,
  meta: ReceiptMeta,
  attachments: Attachment[]
): Promise<{ id: string }> {
  const db = getServiceClient()

  // Use file URL as the saved_links.url value, or synthetic ID if no file
  const primaryFile = attachments[0]
  const url = primaryFile?.url ?? `receipt:${entryId}`
  const fileType = primaryFile?.type ?? null
  const fileUrl = primaryFile?.url ?? null

  const { data, error } = await db
    .from('saved_links')
    .upsert({
      org_id: ORG_ID,
      url,
      label: meta.vendor ?? 'Receipt',
      type: 'receipt',
      receipt_meta: meta,
      file_url: fileUrl,
      file_type: fileType,
      entry_id: entryId,
    }, { onConflict: 'org_id,url' })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to save receipt: ${error.message}`)
  return data as { id: string }
}
```

- [ ] **Step 2: Export from ingest index**

Add to `src/lib/ingest/index.ts`:
```typescript
export { uploadReceiptAttachments, extractReceiptMeta, saveReceipt } from './receipt'
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/ingest/receipt.ts src/lib/ingest/index.ts
git commit -m "feat: receipt upload, Claude extraction, and save module"
```

---

## Task 7: Update Ingest Route

**Files:**
- Modify: `src/app/api/ingest/route.ts`

This is the core integration point. The existing route needs: blocklist check, prefix detection, receipt branch, NOTE/PROJECT passthrough, and PDF support.

**IMPORTANT structural note:** The existing route parses Postmark and uploads attachments inside the `if (source === 'email')` block (lines 131-157). The receipt branch needs to:
1. Detect prefixes BEFORE the attachment upload
2. Skip the existing `uploadPostmarkAttachments` for receipts (receipt.ts handles its own upload to `receipts/` path)
3. Reuse the already-parsed `inbound` variable (don't call `parsePostmarkInbound` twice)

- [ ] **Step 1: Update maxDuration and imports**

At the top of `src/app/api/ingest/route.ts`, change:
```typescript
export const maxDuration = 120
```

Add imports:
```typescript
import { parsePrefixes } from '@/lib/ingest/prefixes'
import { uploadReceiptAttachments, extractReceiptMeta, saveReceipt } from '@/lib/ingest/receipt'
import { isBlocklisted, extractSenderEmail } from '@/lib/blocklist'
```

- [ ] **Step 2: Restructure the email processing block**

Declare hoisted variables before the `if (source === 'email')` block:

```typescript
  let prefixes = { isReceipt: false, note: null as string | null, projectName: null as string | null }
  let inbound: ReturnType<typeof parsePostmarkInbound> | null = null
```

Inside the `if (source === 'email')` block, hoist `inbound`, add prefix detection early, and conditionally skip the standard attachment upload for receipts:

```typescript
  if (source === 'email') {
    inbound = parsePostmarkInbound(body)
    // ... existing StrippedTextReply vs TextBody logic using inbound (unchanged) ...

    // ── Prefix detection (before attachment upload) ──────────────
    prefixes = parsePrefixes(inbound.Subject ?? '')
    if (prefixes.note) sourceMeta.user_note = prefixes.note
    if (prefixes.projectName) sourceMeta.project_name = prefixes.projectName

    // Upload image attachments -- receipts handle their own upload later
    if (!prefixes.isReceipt && inbound.Attachments.length > 0) {
      attachments = await uploadPostmarkAttachments(inbound.Attachments)
    }

    // Bail early if email has no usable text and no attachments (skip for receipts)
    if (!rawText?.trim() && attachments.length === 0 && !prefixes.isReceipt) {
      return NextResponse.json({ error: 'Email had no text or attachments' }, { status: 400 })
    }
  }
```

- [ ] **Step 3: Add blocklist check after dedupe**

After the existing dedupe check (the `if (existing)` block), add:

```typescript
  // ── Blocklist check ──────────────────────────────────────────────
  if (source === 'email') {
    const senderEmail = extractSenderEmail((body.From as string) ?? '')
    const blocked = await isBlocklisted(senderEmail)
    if (blocked) {
      return NextResponse.json({ blocked: true })
    }
  }
```

- [ ] **Step 4: Add receipt branch before processEntry**

Replace the existing "Step 2: Process synchronously" block with:

```typescript
  // ── Step 2: Process ──────────────────────────────────────────────
  try {
    if (prefixes.isReceipt && inbound) {
      // Receipt-specific path: upload files, extract meta, save to saved_links
      const receiptAttachments = await uploadReceiptAttachments(inbound.Attachments)
      const meta = await extractReceiptMeta(rawText, receiptAttachments)
      const receipt = await saveReceipt(newEntry.id, meta, receiptAttachments)

      // Mark entry as done
      await db.from('entries').update({
        processing_status: 'done',
        processed_at: new Date().toISOString(),
      }).eq('id', newEntry.id)

      return NextResponse.json({
        entry_id: newEntry.id,
        receipt_id: receipt.id,
        type: 'receipt',
        meta,
      })
    }

    const result = await processEntry(db, newEntry.id)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { entry_id: newEntry.id, error: message, processing_status: 'failed' },
      { status: 500 }
    )
  }
```

- [ ] **Step 5: Verify build compiles**

```bash
cd /Users/brandym/second-brain
npx next build
```
Expected: build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/app/api/ingest/route.ts
git commit -m "feat: ingest route -- blocklist check, prefix detection, receipt branch"
```

---

## Task 8: Update Links API for Receipts

**Files:**
- Modify: `src/app/api/links/route.ts`

- [ ] **Step 1: Update GET handler**

In the GET handler, add `category` param (accepting `type` as fallback for backwards compatibility) and add a `kind` param:

```typescript
  const categoryFilter = searchParams.get('category')?.trim() || searchParams.get('type')?.trim() || ''
  const kindFilter = searchParams.get('kind')?.trim() ?? 'all'  // all | links | receipts
```

This way the existing frontend (which sends `?type=spreadsheet`) continues working until Task 9 updates it to send `?category=`.

Update the saved_links query to include new columns:

```typescript
  const { data: savedLinks, error: savedError } = await db
    .from('saved_links')
    .select('id, url, label, category, brand_entity_id, hidden, pinned, type, receipt_meta, file_url, file_type, entry_id, created_at')
    .eq('org_id', ORG_ID)
    .order('created_at', { ascending: false })
```

Add kind filtering logic. When `kind=receipts`, only return saved_links with `type='receipt'` (skip entries.links merge). When `kind=links`, exclude receipts. When `kind=all`, return both.

Update the `LinkResult` interface to include:
```typescript
  kind: 'link' | 'receipt'
  receipt_meta: ReceiptMeta | null
  file_url: string | null
  file_type: string | null
```

- [ ] **Step 2: Add PATCH support for receipt metadata editing**

Add to the existing PATCH handler: if the request body contains `receipt_meta`, update that field on the saved_links row:

```typescript
  if (body.receipt_meta) {
    upsertData.receipt_meta = body.receipt_meta
  }
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/brandym/second-brain
npx next build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/links/route.ts
git commit -m "feat: links API -- receipt support, kind filter, category rename"
```

---

## Task 9: Resource Library UI -- Filter Tabs + Receipt Cards

**Files:**
- Modify: `src/app/links/page.tsx`

- [ ] **Step 1: Add kind filter tabs**

Replace the existing `FILTER_OPTIONS` category chips at the top with a two-level filter:

Level 1 (tabs): `All` | `Links` | `Receipts`
Level 2 (shown when Links tab active): existing category chips

Add state:
```typescript
const [activeKind, setActiveKind] = useState<'all' | 'links' | 'receipts'>('all')
```

Update `fetchLinks` to pass `kind` param:
```typescript
if (activeKind !== 'all') params.set('kind', activeKind)
```

Update category filter param from `type` to `category`.

- [ ] **Step 2: Create ReceiptCard component**

Add a `ReceiptCard` function component (similar to existing `LinkCard`) that displays:
- Vendor name (bold) + amount (right-aligned, formatted as $XX.XX)
- Date + brand badge (colored chip)
- Category label
- File thumbnail (image preview or `FileText` icon for PDFs)
- Download button (anchor tag with `download` attribute to file_url)
- Edit button for inline metadata editing
- Checkbox for bulk selection

Use existing Dumpbox design tokens (amber accent, warm cream cards, Lucide icons).

- [ ] **Step 3: Add receipt detail editing**

When user clicks edit on a receipt card, show inline editable fields for vendor, amount, date, brand, category, payment_method. On save, PATCH to `/api/links` with updated `receipt_meta`.

- [ ] **Step 4: Verify in browser**

```bash
cd /Users/brandym/second-brain
npm run dev
```
Open http://localhost:3000/links and verify:
- Tabs render (All/Links/Receipts)
- Links tab shows existing links with category sub-filters
- Receipts tab is empty (no receipts yet -- that's fine)
- No console errors

- [ ] **Step 5: Commit**

```bash
git add src/app/links/page.tsx
git commit -m "feat: resource library -- filter tabs, receipt cards, inline edit"
```

---

## Task 10: Bulk Actions + Permanently Remove

**Files:**
- Modify: `src/app/links/page.tsx`

- [ ] **Step 1: Add selection state**

```typescript
const [selected, setSelected] = useState<Set<string>>(new Set())
```

Add checkbox to each `LinkCard` and `ReceiptCard`. Add "Select all" checkbox in header.

- [ ] **Step 2: Add floating action bar**

When `selected.size > 0`, render a fixed bar at the bottom:

```tsx
{selected.size > 0 && (
  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#2c2014] text-white rounded-xl px-6 py-3 flex items-center gap-4 shadow-lg z-50">
    <span className="text-sm font-medium">{selected.size} selected</span>
    <button onClick={handleBulkRemove} className="text-sm px-3 py-1.5 bg-white/10 rounded-lg hover:bg-white/20">
      Remove
    </button>
    <button onClick={handleBulkPermanentRemove} className="text-sm px-3 py-1.5 bg-red-600 rounded-lg hover:bg-red-700">
      Permanently Remove
    </button>
  </div>
)}
```

- [ ] **Step 3: Implement bulk remove handlers**

`handleBulkRemove`: iterate selected items, call existing DELETE for each.

`handleBulkPermanentRemove`: show confirmation dialog. On confirm, for each selected item:
- POST to `/api/blocklist` with the item's URL (type: 'url') or sender (type: 'sender')
- Then DELETE the item
- Clear selection and refresh

- [ ] **Step 4: Add "Permanently Remove" to individual card actions**

Add alongside existing X (delete) button on each card. On click, show popover with "Block this URL only" / "Block all from this sender" options.

- [ ] **Step 5: Add "Manage blocklist" link**

Small link at the bottom of the Resource Library page. Clicking it shows a modal/section listing all blocklist entries with an "Unblock" button for each.

- [ ] **Step 6: Verify in browser**

Test: select multiple items, verify floating bar appears. Click "Remove" and verify items hide. Test "Permanently Remove" flow with confirmation.

- [ ] **Step 7: Commit**

```bash
git add src/app/links/page.tsx
git commit -m "feat: bulk actions, permanently remove with blocklist, manage blocklist UI"
```

---

## Task 11: Icon/Logo Filtering for Links

**Files:**
- Modify: `src/lib/ingest/urls.ts` (or wherever link extraction happens)
- Modify: `src/lib/ingest/receipt.ts` (already has `isLikelyIcon`, reuse)

- [ ] **Step 1: Add URL icon filtering to link extraction**

In the URL extraction logic (likely in `src/lib/ingest/urls.ts`), add a filter to skip URLs matching icon/favicon patterns:

```typescript
const ICON_URL_PATTERNS = [
  /favicon\.ico$/i,
  /apple-touch-icon/i,
  /\/icon[-_]?\d*\.(png|ico|svg)$/i,
  /\/logo[-_]?\d*\.(png|ico|svg|jpg)$/i,
]

export function isIconUrl(url: string): boolean {
  return ICON_URL_PATTERNS.some(p => p.test(url))
}
```

Apply this filter when extracting links from email bodies, before saving to `entries.links`.

- [ ] **Step 2: Filter icons from display in links API**

In `/api/links/route.ts` GET handler, filter out URLs matching icon patterns from the results:

```typescript
// After building urlMap, filter out icon URLs
for (const [url] of urlMap) {
  if (isIconUrl(url)) urlMap.delete(url)
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/ingest/urls.ts src/app/api/links/route.ts
git commit -m "feat: filter icon/logo/favicon URLs from links"
```

---

## Task 12: NOTE: and PROJECT: Support in Claude Prompt

**Files:**
- Modify: `src/lib/ingest/resolve.ts` (add optional params to `buildSystemPrompt`)
- Modify: `src/lib/ingest/process.ts` (pass note/project from source_meta to prompt builder)

- [ ] **Step 1: Add optional note and project params to buildSystemPrompt**

In `src/lib/ingest/resolve.ts`, update the `buildSystemPrompt` signature to accept optional note and project name strings:

```typescript
export function buildSystemPrompt(
  entityContext: string,
  senderContext: string,
  taskContext: string,
  userNote?: string | null,
  projectName?: string | null,
): string {
  const today = new Date().toISOString().slice(0, 10)
  let prompt = `You are an AI assistant processing operational notes...` // existing body unchanged

  // Append note context if present
  if (userNote) {
    prompt += `\n\nThe sender added this note when forwarding: "${userNote}"\nConsider this context when extracting tasks and decisions.`
  }

  // Append project context if present
  if (projectName) {
    prompt += `\n\nThe sender tagged this with PROJECT:${projectName}. All extracted tasks and decisions should be associated with this project entity. If this project doesn't exist yet, include it in classify_entities as type "project".`
  }

  return prompt
}
```

- [ ] **Step 2: Pass note and project from process.ts**

In `src/lib/ingest/process.ts`, where `buildSystemPrompt` is called, extract note and project from the entry's `source_meta` and pass them:

```typescript
const userNote = (entry.source_meta as any)?.user_note ?? null
const projectName = (entry.source_meta as any)?.project_name ?? null
const systemPrompt = buildSystemPrompt(entityContext, senderContext, taskContext, userNote, projectName)
```

- [ ] **Step 3: Add note display in dumpling detail view**

Find the entry/dumpling detail component (likely in the dashboard or history page). When `source_meta.user_note` is present, render a highlighted callout:

```tsx
{entry.source_meta?.user_note && (
  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-900">
    <span className="font-medium">Note:</span> {entry.source_meta.user_note}
  </div>
)}
```

Check these files for the detail view: `src/app/page.tsx` (dashboard), `src/app/history/page.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ingest/resolve.ts src/lib/ingest/process.ts
git commit -m "feat: NOTE: and PROJECT: context in Claude ingest prompt + note callout in UI"
```

---

## Task 13: Project Entity Support in Ingest

**Files:**
- Modify: `src/lib/ingest/process.ts`
- Modify: `src/lib/entities.ts`

- [ ] **Step 1: Allow 'project' as an entity type**

In `src/lib/entities.ts`, verify `resolveOrCreateEntity` accepts `type: 'project'`. The existing code uses a dynamic type field with no constraint, so this should work. If there's a hardcoded type list, add `'project'`.

- [ ] **Step 2: Link tasks to project entities**

In `src/lib/ingest/process.ts`, in the `create_tasks` tool handler, after creating a task and linking brand/vendor entities, check if a project entity was resolved during this ingest. If so, create a `task_entities` row with `role: 'project'`:

```typescript
// After existing entity linking in create_tasks handler
if (projectEntity) {
  await db.from('task_entities').upsert({
    task_id: taskId,
    entity_id: projectEntity.id,
    role: 'project',
  }, { onConflict: 'task_id,entity_id,role' })
}
```

The project entity comes from the `classify_entities` tool output -- Claude will include it when `PROJECT:` prefix or project reference is detected.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ingest/process.ts src/lib/entities.ts
git commit -m "feat: project entity linking in ingest pipeline"
```

---

## Task 14: Projects Page

**Files:**
- Create: `src/app/projects/page.tsx`
- Create: `src/app/api/projects/route.ts`

- [ ] **Step 1: Create projects API**

```typescript
// src/app/api/projects/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { hasValidSession } from '@/lib/auth'

export async function GET(): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getServiceClient()

  // Fetch project entities
  const { data: projects } = await db
    .from('entities')
    .select('id, name, metadata, first_seen, last_seen, created_at')
    .eq('org_id', ORG_ID)
    .eq('type', 'project')
    .eq('archived', false)
    .order('last_seen', { ascending: false })

  if (!projects || projects.length === 0) {
    return NextResponse.json({ projects: [] })
  }

  // Fetch task counts per project
  const projectIds = projects.map(p => p.id)
  const { data: taskLinks } = await db
    .from('task_entities')
    .select('entity_id, tasks(id, status)')
    .eq('role', 'project')
    .in('entity_id', projectIds)

  // Build count map
  const countMap: Record<string, { open: number; done: number; overdue: number }> = {}
  for (const link of taskLinks ?? []) {
    const l = link as any
    const eid = l.entity_id
    if (!countMap[eid]) countMap[eid] = { open: 0, done: 0, overdue: 0 }
    if (l.tasks?.status === 'open') countMap[eid].open++
    if (l.tasks?.status === 'done') countMap[eid].done++
  }

  const enriched = projects.map(p => ({
    ...p,
    status: p.metadata?.status ?? 'active',
    tasks: countMap[p.id] ?? { open: 0, done: 0, overdue: 0 },
  }))

  return NextResponse.json({ projects: enriched })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, description, target_date } = await req.json()
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const db = getServiceClient()

  const { data, error } = await db
    .from('entities')
    .insert({
      org_id: ORG_ID,
      type: 'project',
      name,
      normalized_name: name.toLowerCase().trim().replace(/\s+/g, ' '),
      metadata: {
        status: 'active',
        description: description ?? null,
        target_date: target_date ?? null,
      },
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ project: data })
}
```

- [ ] **Step 2: Create projects page**

```typescript
// src/app/projects/page.tsx -- client component
// List view: project cards with name, status badge, task counts, last activity
// "Create Project" button
// Click card to navigate to /projects/[id]
// Follow existing Dumpbox design patterns (header, warm theme, Lucide icons)
```

Build the page following the same patterns as `/links/page.tsx`:
- Dark header with logo and nav
- Card grid for projects
- Status badge (active = green, on_hold = amber, completed = gray)
- Task count summary (X open, X done)
- Last activity date

- [ ] **Step 3: Create project detail page**

```typescript
// src/app/projects/[id]/page.tsx
// Aggregates: tasks, decisions, receipts, links, pending responses linked to this project
// Wiki page link (auto-generated)
// Status toggle (active/on_hold/completed)
```

- [ ] **Step 4: Add Projects to navigation**

In every page that has the header nav (dashboard, links, wiki, etc.), add Projects link. Relevant files to update:
- `src/app/links/page.tsx` -- header nav
- `src/app/page.tsx` -- dashboard header
- `src/app/wiki/page.tsx` -- if it has a header
- Other pages with the shared header

Add between existing nav items:
```tsx
<a href="/projects" className="text-base text-white/70 font-medium hover:text-white transition-colors flex items-center gap-1.5">
  <FolderOpen size={15} />Projects
</a>
```

- [ ] **Step 5: Verify in browser**

```bash
npm run dev
```
Open http://localhost:3000/projects -- verify empty state renders. Create a project manually. Verify it appears.

- [ ] **Step 6: Commit**

```bash
git add src/app/projects/ src/app/api/projects/ src/app/links/page.tsx src/app/page.tsx
git commit -m "feat: projects page, detail view, and navigation"
```

---

## Task 15: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document new features in CLAUDE.md**

Add to the appropriate sections:
- **Email Prefix Commands**: `RECEIPT:`, `NOTE:`, `PROJECT:` in Architecture section
- **Saved Links**: note the `type` column (link/receipt), receipt_meta fields
- **Blocklist**: new table, checked during ingest
- **Projects**: entity type `project`, metadata shape, `/projects` page
- **Migration 028**: receipts, blocklist, projects
- **Pages**: add `/projects`

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with receipts, blocklist, projects"
```

---

## Task 16: End-to-End Verification

- [ ] **Step 1: Run all tests**

```bash
cd /Users/brandym/second-brain
npx vitest run
```
Expected: all tests pass

- [ ] **Step 2: Build check**

```bash
npx next build
```
Expected: build succeeds with no errors

- [ ] **Step 3: Manual test -- receipt forwarding**

1. Start dev server: `npm run dev`
2. Send test POST to `/api/ingest` simulating a Postmark webhook with `RECEIPT:` in subject
3. Verify receipt appears in Resource Library under Receipts tab
4. Verify file download works
5. Edit metadata inline and save

- [ ] **Step 4: Manual test -- note forwarding**

1. Send test POST with `NOTE: test note` in subject
2. Verify note appears in dumpling detail view

- [ ] **Step 5: Manual test -- project creation**

1. Send test POST with `PROJECT:Test Project` in subject
2. Verify project entity created
3. Verify task linked to project
4. Verify project appears on `/projects` page

- [ ] **Step 6: Manual test -- blocklist**

1. In Resource Library, click "Permanently Remove" on a link
2. Choose "Block this URL only"
3. Verify item disappears
4. Simulate ingest with that URL -- verify it's blocked
5. Open "Manage blocklist" -- verify entry appears, unblock works

- [ ] **Step 7: Manual test -- bulk actions**

1. Select multiple items in Resource Library
2. Click "Remove" -- verify items hide
3. Select more, click "Permanently Remove" -- verify confirmation, items blocked
