# Multi-User Support Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Michelle Tipsword as second user — own tasks, email forwarding, filtered dashboard. Shared org, shared wiki/entities.

**Architecture:** Add `owner_email` to tasks table. `hasValidSession()` returns user email instead of boolean. Dashboard shows my tasks + all public tasks. Email ingest identifies owner from Postmark `From` header. No org_id changes needed — same org, different owners.

**Tech Stack:** Supabase migration, Next.js API routes, existing auth

---

### Task 1: Migration — add owner_email to tasks

**Files:**
- Create: `supabase/migrations/027_task_owner.sql`

- [ ] **Step 1: Write migration**

```sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS owner_email text;
CREATE INDEX IF NOT EXISTS tasks_owner ON tasks(org_id, owner_email, status);
-- Backfill existing tasks to Brandy
UPDATE tasks SET owner_email = 'bmurch@thresholdbrands.com' WHERE owner_email IS NULL;
```

- [ ] **Step 2: Run in Supabase SQL editor**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/027_task_owner.sql
git commit -m "migration: add owner_email to tasks"
```

---

### Task 2: Auth — return user email, add Michelle

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `src/lib/supabase/middleware.ts`

- [ ] **Step 1: Update ALLOWED_EMAILS and return email from hasValidSession**

In `src/lib/auth.ts`, change `ALLOWED_EMAILS`:
```typescript
const ALLOWED_EMAILS = [
  'bmurch@thresholdbrands.com',
  'brandymurch@gmail.com',
  'mtipsword@thresholdbrands.com',
]
```

Change `hasValidSession` to return `string | null` (email) instead of `boolean`:
```typescript
export async function hasValidSession(): Promise<string | null> {
  // ... existing cookie/session logic ...
  if (!user || !ALLOWED_EMAILS.includes(user.email ?? '')) return null
  return user.email!
}
```

- [ ] **Step 2: Update middleware ALLOWED_EMAILS**

In `src/lib/supabase/middleware.ts`, add `'mtipsword@thresholdbrands.com'` to the array.

- [ ] **Step 3: Update all callers of hasValidSession**

Every route that does `const authenticated = await hasValidSession()` then `if (!authenticated)` — this still works because `null` is falsy and a string is truthy. No changes needed to callers that just check truthiness.

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth.ts src/lib/supabase/middleware.ts
git commit -m "feat: add Michelle Tipsword, hasValidSession returns email"
```

---

### Task 3: Task types — add owner_email

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add owner_email to Task interface**

```typescript
export interface Task {
  // ... existing fields ...
  owner_email: string | null  // add after 'public'
}
```

- [ ] **Step 2: Commit**

---

### Task 4: Ingest — tag tasks with owner email

**Files:**
- Modify: `src/app/api/ingest/route.ts`
- Modify: `src/lib/ingest/process.ts`
- Modify: `src/app/api/tasks/route.ts` (POST handler)

- [ ] **Step 1: Pass owner_email through ingest pipeline**

In `src/app/api/ingest/route.ts`, extract the owner:
- For email source: use `sourceMeta.from` (the person forwarding)
- For paste/chat source: use the authenticated user's email from `hasValidSession()`

Store `owner_email` in the entry's source_meta so `processEntry` can access it.

- [ ] **Step 2: Set owner_email when creating tasks in process.ts**

In `src/lib/ingest/process.ts`, when inserting tasks, include `owner_email` from the entry's source_meta.

- [ ] **Step 3: Set owner_email in manual task creation (POST /api/tasks)**

```typescript
const userEmail = await hasValidSession()
// ... in insert:
owner_email: userEmail,
```

- [ ] **Step 4: Commit**

---

### Task 5: Dashboard — filter by owner + public

**Files:**
- Modify: `src/app/api/dashboard/route.ts`

- [ ] **Step 1: Get user email from session**

```typescript
const userEmail = await hasValidSession()
if (!userEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```

- [ ] **Step 2: Filter task queries**

Replace the open tasks query with:
```typescript
const { data: allOpenTasks } = await db.from('tasks')
  .select('*, task_entities(role, entities(id, name, type))')
  .eq('org_id', ORG_ID)
  .in('status', ['open', 'blocked'])
  .or(`owner_email.eq.${userEmail},public.eq.true,owner_email.is.null`)
  .order('escalation', { ascending: false })
  .order('due_date', { ascending: true, nullsFirst: false })
```

Same pattern for tracking tasks, stats counts, etc.

- [ ] **Step 3: Update stat counts to match filtered view**

Stats should reflect what the user sees, not all org tasks.

- [ ] **Step 4: Commit**

---

### Task 6: Public board — show owner name on tasks

**Files:**
- Modify: `src/app/api/public/watching/route.ts`
- Modify: `src/app/public/watching/page.tsx`

- [ ] **Step 1: Include owner_email in public API response**

Add `owner_email` to the normalized task output.

- [ ] **Step 2: Display owner on public board**

Show a label like "Brandy" or "Michelle" on each task card.

- [ ] **Step 3: Commit**

---

### Task 7: Email mapping — identify Michelle's forwards

**Files:**
- Modify: `src/app/api/ingest/route.ts`

- [ ] **Step 1: Map From email to owner**

When a Postmark email comes in, check the `From` header:
- If from `bmurch@` or `brandymurch@` → owner = `bmurch@thresholdbrands.com`
- If from `mtipsword@` → owner = `mtipsword@thresholdbrands.com`
- Otherwise → owner = null (unassigned)

This is a simple lookup, not a database query.

- [ ] **Step 2: Commit**

---

### Task 8: Verify and deploy

- [ ] **Step 1: Run `npx tsc --noEmit`**
- [ ] **Step 2: Run `npx next build`**
- [ ] **Step 3: Test locally — log in as Brandy, verify filtered dashboard**
- [ ] **Step 4: Push and deploy**
- [ ] **Step 5: Have Michelle log in with Google OAuth and verify her view**
