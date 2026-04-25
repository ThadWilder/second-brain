# Receipts, Notes, Projects + Resource Library Enhancements

**Date:** 2026-04-25
**Status:** Approved
**Project:** Dumpbox (second-brain)

## Summary

Add three email prefix commands (`RECEIPT:`, `NOTE:`, `PROJECT:`), introduce Projects as a new entity type, enhance the Resource Library with receipt storage and blocklist/bulk actions, and accept PDF attachments.

## Scope

1. **Receipt ingestion** -- `RECEIPT:` prefix triggers receipt-specific ingest path
2. **Note ingestion** -- `NOTE:` prefix attaches a user note to the dumpling
3. **Projects** -- new entity type `project`, with dedicated page, auto-detection, and prefix support
4. **Receipts in Resource Library** -- filterable tab, editable metadata, file download
5. **Blocklist** -- "permanently remove" with choice of URL-only or sender-wide blocking
6. **Bulk actions** -- multi-select remove/permanently-remove in Resource Library
7. **Link cleanup** -- never store or display icon/favicon/logo images for links
8. **PDF support** -- accept `application/pdf` attachments in ingest pipeline

## Out of Scope

- Automated Outlook triage pipeline (parked for later)
- Full expense reporting / CSV export
- Kanban/board view for projects (future enhancement on same data model)

---

## 1. Email Prefix Commands

The ingest pipeline detects prefixes anywhere in the email subject (to survive `Fwd:` and `Re:` prepending).

### `RECEIPT:` -- Receipt Ingestion

**Trigger:** Subject contains `RECEIPT:` (case-insensitive). Example: `Fwd: RECEIPT: Adobe invoice`.

**Flow:**
1. Postmark webhook hits `/api/ingest`
2. Existing dedupe check by MessageID
3. **New: blocklist check** (see Section 5)
4. Detect `RECEIPT:` in subject
5. Receipt-specific path:
   - Upload all file attachments (images + PDFs) to Supabase Storage under `receipts/YYYY-MM/uuid.ext`
   - For embedded/CID images: keep only those that pass the icon/logo filter (see Section 8)
   - Call Claude (Sonnet) to extract receipt metadata from email text + attachments
   - Save a `saved_links` row with `type: 'receipt'` and structured metadata
   - Skip normal task/decision/entity extraction (receipts are not actionable items)
6. Entry still created in `entries` table (source `'email'`) for history/audit trail

**Claude extracts:**
- **vendor** (string) -- merchant or service name
- **amount** (number) -- total in dollars
- **date** (string, ISO 8601) -- purchase date
- **payment_method** (string, nullable) -- e.g., "Visa ending 4521"
- **category** (string) -- one of: `software`, `travel`, `meals`, `office_supplies`, `advertising`, `services`, `subscriptions`, `equipment`, `other`
- **brand** (string, nullable) -- which brand or Threshold HQ/TMS, inferred from context

If Claude cannot determine a field, it returns null. Receipts are saved regardless.

### `NOTE:` -- User Note

**Trigger:** Subject contains `NOTE:` (case-insensitive). Example: `NOTE: context for the Adobe renewal`.

**Flow:**
1. Normal ingest pipeline runs (tasks, decisions, entities extracted as usual)
2. The text after `NOTE:` in the subject is extracted and stored in `source_meta.user_note`
3. Claude's ingest prompt includes the note as additional context: "The sender added this note: {note}"
4. The note displays in the dumpling detail view as a highlighted callout

This lets you annotate a forwarded email with your own context before it enters Dumpbox.

### `PROJECT:` -- Project Assignment

**Trigger:** Subject contains `PROJECT:ProjectName` (case-insensitive). Example: `PROJECT:Website Redesign` or `Fwd: PROJECT:Q2 Campaign some email subject`.

**Flow:**
1. Normal ingest pipeline runs
2. The project name after `PROJECT:` is extracted
3. Claude is told to associate all extracted tasks/decisions with this project entity
4. If the project entity doesn't exist, it's created automatically
5. The entry and all extracted items link to the project entity

**Combining prefixes:** Prefixes can be combined. `RECEIPT: PROJECT:MaidPro` forwards a receipt and tags it to the MaidPro project. `NOTE:needs follow-up PROJECT:Website Redesign` adds a note and assigns to a project.

### Prefix Parsing Rules

- Case-insensitive matching
- Detected anywhere in subject (survives `Fwd:`, `Re:`)
- `NOTE:` -- text after `NOTE:` up to the next recognized prefix or end-of-subject is the note
- `PROJECT:` -- text after `PROJECT:` up to the next recognized prefix (`RECEIPT:`, `NOTE:`) or end-of-subject is the project name (supports multi-word names like "Website Redesign"), with leading/trailing whitespace trimmed
- `RECEIPT:` -- presence is enough, no value parsed from it
- Order does not matter: `PROJECT:Q2 Campaign NOTE:invoice attached RECEIPT:` and `RECEIPT: PROJECT:Q2 Campaign` are equivalent

---

## 2. Projects (Entity Type)

Projects are a new entity type in the existing entity system.

### Data Model

No new tables. Projects use the existing infrastructure:

```
entities.type = 'project'
entities.metadata = {
  "status": "active",        -- active | completed | on_hold
  "description": "...",       -- optional project description
  "target_date": "2026-06-30" -- optional target date
}
```

Projects link to other entities via `entity_relationships`:
- A project `works_on` a brand (cross-brand projects link to multiple brands)
- A project has team members via `member_of` relationships

Tasks, decisions, entries, and pending responses link to projects via existing join tables (`task_entities`, `decision_entities`, `entry_entities`) with role `'project'`.

### Entity Resolution

Claude detects project references during ingest the same way it detects brands/contacts:
- Projects included in the entity context passed to Claude
- Fuzzy matching + aliases for project name variations
- Auto-creation when a `PROJECT:` prefix names a new project

### `/projects` Page

New page listing all active projects:
- Project name, status badge, brand associations
- Task counts: open, overdue, completed
- Last activity date
- Click to view project detail

### Project Detail View

Aggregates everything linked to the project entity:
- **Tasks** -- all tasks linked via `task_entities` with role `'project'`
- **Decisions** -- via `decision_entities`
- **Receipts** -- `saved_links` rows where `receipt_meta.brand` matches or explicitly linked
- **Links** -- from entries linked to the project
- **Pending responses** -- via `pending_response_entities`
- **Wiki page** -- auto-generated per entity (existing behavior)

### Navigation

Add "Projects" to the header nav bar between existing items.

---

## 3. Resource Library Updates

### Filter Tabs

Top of `/links` page, replacing current category filter chips:

```
[All (142)] [Links (95)] [Receipts (47)]
```

Within the Links tab, the existing category sub-filters (Spreadsheet, Document, etc.) still apply. Active tab uses amber underline.

### API Contract Changes (`/api/links`)

The existing `?type=spreadsheet` query param filters by category. To avoid collision with the new `saved_links.type` column (link vs receipt), rename the query param:

- `?category=spreadsheet` -- filters links by URL category (existing behavior, renamed from `?type`)
- `?kind=all|links|receipts` -- filters by resource kind (new, maps to `saved_links.type`)

The `GET` response shape expands. The existing `LinkResult` interface gains optional receipt fields:
- `receipt_meta` (object, nullable) -- vendor, amount, date, payment_method, category, brand
- `file_url` (string, nullable) -- Supabase Storage URL for the receipt file
- `file_type` (string, nullable) -- MIME type of the receipt file
- `kind` (string) -- `'link'` or `'receipt'`

The SQL query for `saved_links` expands to select the new columns: `type, receipt_meta, file_url, file_type`.

### Receipt Card

Each receipt displays:
- **Vendor name** (bold) + **amount** (right-aligned)
- **Date** + **brand badge** (colored chip)
- **Category** label (e.g., "Software", "Travel")
- **Thumbnail** of receipt file (click to preview full size in modal; PDF icon fallback via `FileText` from Lucide)
- **Download** button -- browser download of the PDF/image
- **Edit** -- click any metadata field to edit inline (vendor, amount, date, brand, category, payment method)
- **Checkbox** for bulk selection

### Link Cards (Updated)

- No icon/favicon/logo images stored or displayed (see Section 8)
- Checkbox added for bulk selection
- New "Permanently Remove" option alongside existing delete
- Everything else unchanged

---

## 4. Blocklist

### "Permanently Remove" Action

Available on every item in the Resource Library (links and receipts):

1. User clicks "Permanently Remove" (distinct from existing "Remove"/hide)
2. Popover asks: **"Block this URL only"** or **"Block all from this sender"**
   - For receipts without a meaningful URL: defaults to sender-only option
3. Creates a `blocklist` entry
4. Deletes the item (link hidden via existing mechanism, receipt row deleted)

### Ingest Pipeline Check

Early in `/api/ingest`, after dedupe and before any processing:

1. Extract sender email from Postmark `From` field
2. Query `blocklist` for matching `sender` type entry
3. If `RECEIPT:` prefix, also check URLs in body against `url` type entries
4. If match found, return `200` with `{ blocked: true }` and stop

### Manage Blocklist

Small "Manage blocklist" link at bottom of Resource Library page. Opens a list of all blocked patterns (URL or sender) with ability to unblock.

---

## 5. Bulk Actions

### Selection UI

- Checkbox on each card in Resource Library (links and receipts)
- "Select all" checkbox in header (selects all visible/filtered items)

### Floating Action Bar

When 1+ items selected, a fixed bar at the bottom of the viewport:

```
[X selected]  [Remove]  [Permanently Remove]
```

- **Remove** -- soft delete (existing hide behavior for links; delete row for receipts)
- **Permanently Remove** -- confirmation dialog: "Block X items? They won't be ingested again." On confirm, adds each item's URL (or sender for receipts) to blocklist and removes items.

---

## 6. Database Changes

### Migration 028: receipts + blocklist + projects

**`saved_links` table -- add columns for receipts:**

```sql
-- Add type column to distinguish links from receipts
ALTER TABLE saved_links ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'link';

-- Receipt-specific fields
ALTER TABLE saved_links ADD COLUMN IF NOT EXISTS receipt_meta jsonb;
ALTER TABLE saved_links ADD COLUMN IF NOT EXISTS file_url text;
ALTER TABLE saved_links ADD COLUMN IF NOT EXISTS file_type text;

-- Index for type filtering
CREATE INDEX IF NOT EXISTS idx_saved_links_type ON saved_links (org_id, type);
```

`receipt_meta` JSONB shape:
```json
{
  "vendor": "Adobe",
  "amount": 54.99,
  "date": "2026-04-20",
  "payment_method": "Visa ending 4521",
  "category": "software",
  "brand": "Threshold HQ"
}
```

**New `blocklist` table:**

```sql
CREATE TABLE IF NOT EXISTS blocklist (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL,
  pattern text NOT NULL,
  type text NOT NULL CHECK (type IN ('url', 'sender')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_blocklist_org_lookup ON blocklist (org_id, type, pattern);

ALTER TABLE blocklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY blocklist_org_policy ON blocklist
  FOR ALL USING (org_id = '00000000-0000-0000-0000-000000000001'::uuid);
```

**`task_entities` role constraint -- add `project`:**

```sql
ALTER TABLE task_entities DROP CONSTRAINT IF EXISTS task_entities_role_check;
ALTER TABLE task_entities ADD CONSTRAINT task_entities_role_check
  CHECK (role IN ('brand', 'assigned_to', 'vendor', 'topic', 'related', 'project'));
```

**`saved_links` URL column for receipts:**

The existing unique index `saved_links_url ON saved_links (org_id, url)` requires a value in `url`. For receipts, use the Supabase Storage public URL as the `url` value (same as `file_url`). If no file is attached, use a synthetic identifier: `receipt:{entry_id}`. This keeps the unique constraint functional and avoids collisions with real URLs.

**`saved_links` RLS (pre-existing gap, fix in this migration):**

```sql
ALTER TABLE saved_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY saved_links_org_policy ON saved_links
  FOR ALL USING (org_id = '00000000-0000-0000-0000-000000000001'::uuid);
```

**Entries source constraint -- no change needed.** Receipt emails still have `source = 'email'`. The receipt vs. normal distinction lives in `saved_links.type`, not in entries.

**`maxDuration` note:** Increasing ingest route from 60 to 120 is supported on the Vercel Pro plan (allows up to 300s).

### Supabase Storage

Receipt files stored in existing `attachments` bucket under `receipts/YYYY-MM/uuid.ext`. Upload logic in `/api/ingest/route.ts` expanded to accept:

```typescript
const ALLOWED_FILE_TYPES = [
  'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp',
  'application/pdf',
]
```

Max file size: 10MB per attachment.

---

## 7. Ingest Pipeline Changes

### Updated flow in `/api/ingest`

```
1. Parse Postmark payload (existing)
2. Dedupe by MessageID (existing)
3. NEW: Blocklist check -- query blocklist, drop if match
4. NEW: Parse subject for prefixes (RECEIPT:, NOTE:, PROJECT:)
5. Store raw entry in entries table (existing)
6. NEW: If RECEIPT: prefix:
   a. Upload all attachments (images + PDFs) to Storage
   b. Filter embedded images (remove icons/logos)
   c. Call Claude for receipt metadata extraction
   d. Insert saved_links row with type='receipt'
   e. STOP (skip normal processEntry)
7. If NOT receipt:
   a. NEW: If NOTE: prefix, add user_note to source_meta
   b. NEW: If PROJECT: prefix, add project_name to source_meta
   c. Call processEntry (existing) -- Claude prompt updated to:
      - Include user note as context when present
      - Detect and link project entities
      - Auto-create project entity if PROJECT: prefix names unknown project
8. Wiki queue (existing, unchanged)
```

### `maxDuration` increase

Change from `60` to `120` on the ingest route to accommodate receipt attachment uploads + Claude vision calls.

---

## 8. Icon/Logo/Favicon Filtering

Applies to both receipt embedded images AND link extraction:

**Filter criteria (skip image if ANY match):**
- File size < 10KB
- Filename or alt text contains "logo", "icon", "favicon", "sprite", "badge", "banner" (case-insensitive)
- Content-Type is `image/x-icon` or `image/vnd.microsoft.icon`

**Simplified approach:** No image dimension detection (avoids `sharp` dependency). The file-size + filename heuristics catch the vast majority of icons/logos.

For links: when extracting URLs from email bodies, skip URLs that match common icon/favicon patterns (e.g., `/favicon.ico`, `/apple-touch-icon.png`).

---

## 9. Edge Cases and Safety

### Receipt parsing fallbacks
- Claude cannot extract amount or vendor: save with null fields, editable in UI
- No attachment and no extractable embedded image: save metadata, show "no file attached" indicator
- Multiple receipt files in one email: save all files, link them all to the same receipt record

### Blocklist
- Checked during email ingest only (Postmark webhook), not manual paste/chat dumps
- Sender blocking matches email address only, not display name
- Blocklist entries persist until manually unblocked

### Bulk delete safety
- "Remove" is soft delete (hide)
- "Permanently Remove" shows confirmation dialog
- No undo on permanent remove (blocklist entry persists)

### PDF handling
- Max 10MB per attachment
- Stored as-is, not converted
- UI shows `FileText` Lucide icon as thumbnail for PDFs

### Project auto-creation
- `PROJECT:` prefix with unknown name creates the entity with status `active`
- Claude ingest can also detect project references in email body and link to existing projects
- Duplicate project names resolved by fuzzy matching (same as all entity types)

### Prefix parsing
- See Section 1 "Prefix Parsing Rules" for the canonical definition

---

## 10. Implementation Order

1. **Migration 028** -- `saved_links` columns, `blocklist` table, `task_entities` role constraint
2. **PDF upload support** -- expand `ALLOWED_FILE_TYPES`, increase `maxDuration`
3. **Prefix detection** -- parse `RECEIPT:`, `NOTE:`, `PROJECT:` from subject in ingest route
4. **Receipt ingest path** -- Claude extraction prompt, `saved_links` insert with `type='receipt'`
5. **Note support** -- `source_meta.user_note`, Claude prompt update, UI callout in dumpling detail
6. **Project entity type** -- entity creation, `task_entities` role, Claude prompt update for detection
7. **Resource Library: filter tabs** -- All/Links/Receipts, receipt card component
8. **Resource Library: receipt edit + download** -- inline editing, file download button
9. **Blocklist** -- "permanently remove" action, `blocklist` table check in ingest, manage UI
10. **Bulk actions** -- checkboxes, floating action bar, mass remove/block
11. **Icon/logo filtering** -- skip small/icon images in receipt extraction and link saving
12. **`/projects` page** -- project list + detail view
13. **Navigation** -- add Projects to header nav
