# Dumpbox

**Personal chaos organizer for Threshold Brands marketing team.**
Items dumped into the app are called **dumplings**. The morning briefing email is called **Dim Sum**.

## Stack
- **Framework**: Next.js 14.2.3 (App Router)
- **Database**: Supabase (Postgres + RLS + pg_trgm extension)
- **AI**: Anthropic Claude (direct API for ingest/cron, Managed Agents for chat)
- **Email**: Postmark (inbound via `dump@dumpbox.app`, outbound from `briefing@dumpbox.app`)
- **Hosting**: Vercel Pro plan
- **Domain**: `dumpbox.app` (Cloudflare DNS)
- **Auth**: Google OAuth via Supabase Auth — access gated by `ALLOWED_EMAILS` env var (comma-separated, lowercase). Enforced in `src/lib/allowed-emails.ts`, consumed by middleware + `hasValidSession()`. Set in Vercel and `.env.local` before first login or every sign-in bounces to `/login`.

## Key IDs
Real values live in `.env.local` and Vercel project settings — placeholders below
so this doc is safe to share. Look up actual IDs in the respective dashboards.

- **Supabase**: project `<supabase-project-ref>` (see Supabase dashboard → Project Settings → General)
- **Vercel**: project `<vercel-project-id>` (Vercel dashboard → project Settings → General)
- **Postmark**: server `second-brain`, inbound hash `<postmark-inbound-hash>` (Postmark dashboard → Servers → Inbound stream). **Note**: this hash was rotated after the repo was briefly public — old hash `8887764d` is dead.
- **Managed Agent**: `<managed-agent-id>`, env `<managed-environment-id>` (Anthropic console → Managed Agents)
- **Org ID**: `00000000-0000-0000-0000-000000000001` (single-org, hardcoded — not sensitive)

## Team & Entities
- **Owner**: Brandy Murch (bmurch@thresholdbrands.com, brandymurch@gmail.com)
- **Team**: Michelle, Dustin, Amanda (NOT Jack)
- **Internal Team**: Threshold Brands HQ, TMS (Threshold Marketing Services)
- **Vendors**: The Marketing Agency (TMA), Red Brick
- **Vendor Team**: Moe (works at TMA)
- **10 brands**: MaidPro, USA Insulation, Pestmaster, Men In Kilts, Mold Medics, Miracle Method, Granite Garage Floors, PHP (Plumbing & Heating Paramedics), HAP (Heating & Air Paramedics), PLP (Plumbing Paramedics)

## Entity Types
| Type | DB Value | Icon | Example |
|------|----------|------|---------|
| Brand | `brand` | 🏢 | MaidPro, USA Insulation |
| Internal Team | `department` | 🏛️ | Threshold Brands HQ, TMS |
| Franchisee | `franchisee` | 🏠 | (franchise owners/operators) |
| Team Member | `contact` | 👤 | Michelle, Dustin, Amanda, Brandy |
| Vendor | `vendor` | 🤝 | The Marketing Agency, Red Brick |
| Vendor Team | `vendor_team` | 👤 | Moe |
| Freelancer | `freelancer` | 💻 | (independent contractors) |
| Project | `project` | 📋 | Website Redesign, Q2 Campaign |

Entities can be archived (`archived` boolean column) — hidden from dashboard but history preserved.

## Architecture

### Ingest pipeline (`/api/ingest`)
1. Accepts email (Postmark webhook), paste, chat, meeting notes
2. Dedupes by message ID
3. Uploads attachments to Supabase Storage
4. **Sender-aware**: looks up `From` email in entity aliases, tells Claude "I/me/my refers to {name}"
5. **Primary actor heuristic**: only links entities with explicit action items, not passing mentions
6. **Task dedup**: feeds existing open tasks into Claude prompt to prevent duplicates
7. **Smart text selection**: for forwarded emails, detects signature-only `StrippedTextReply` and falls through to full `TextBody`
8. Calls Claude to extract: tasks, decisions, pending responses, entities
9. Resolves entities via fuzzy matching + aliases
10. **Queues wiki updates** (async via `wiki_queue` table + `/api/wiki/process` endpoint)
11. Returns structured `IngestResult` with counts
12. `ensureArray()` utility handles Claude returning single objects vs arrays

### Wiki system
- Wiki pages auto-generated per entity when dumplings mention them
- **Decoupled from ingest**: updates queued in `wiki_queue` table, processed by `/api/wiki/process` (5-min timeout, processes 5 at a time, self-chains)
- **Pinned sections**: human-written content preserved across Claude rewrites (`pinned_sections` JSONB column)
- **Edit button**: full page editing via `WikiPageClient.tsx`
- Claude gets instructions to NOT duplicate pinned content

### Chat (`/api/chat/*`)
- Uses Anthropic Managed Agents (not direct API)
- **Write tools**: update_task, create_task, assign_entity_to_task, add_note_to_task, close_tasks_for_brand
- Entity resolution via `resolveEntityByName()` — 4-step: exact, cross-type, alias, ILIKE fallback
- Session: `agent_reference` format, `environment` (not `environment_id`)
- Events: type `"user"` (not `"user.message"`), tool results: type `"tool_result"` with `tool_use_id`
- Polling: `GET /events?order=asc&limit=100` (not SSE, no after_id)
- Beta header: `agent-api-2026-03-01`

### Cron routes (all GET, Vercel Cron)
- `/api/cron/briefing` — "Dim Sum" morning briefing via Sonnet + Postmark, daily 7am ET
- `/api/cron/nudge` — stale task nudges via Sonnet + Postmark, daily 2pm ET
- `/api/cron/digest` — weekly strategic digest via **Opus**, Sunday 8pm ET
- `/api/cron/wiki` — wiki queue processor via Haiku, every 4 hours, batch size 10
- `/api/audits/sync` — TMS audit Google Sheet sync, Mondays 8am ET
- `/api/reviews/sync` — NiceJob reviews Google Sheet sync, Mondays 8am ET
- All protected by `CRON_SECRET` in Authorization header (rejects if env var unset)
- Briefing/digest have try-catch, nudge has try-catch

### AI Models
- **Sonnet 4.5** (`CLAUDE_MODEL`): ingest, briefing, nudge, chat
- **Haiku 4.5** (`CLAUDE_MODEL_FAST`): wiki synthesis, email drafting
- **Opus 4.6** (`CLAUDE_MODEL_DEEP`): weekly digest (strategic analysis)

### Email Prefix Commands
- `FYI:` — no tasks created. Just classify entities, log decisions. Context-only for the wiki.
- `TRACK:` — creates tasks with `waiting_on` set to the responsible person. Brandy is monitoring, not doing.
- `RECEIPT:` — receipt-specific ingest path (skip tasks, extract receipt metadata, save to saved_links)
- `NOTE:` — attaches user note to the dumpling, passed as context to Claude
- `PROJECT:` — tags ingest with a project entity, auto-creates if new
- Prefixes are case-insensitive, can appear anywhere in subject (survives Fwd:/Re:), and can be combined. Also detected in the first 3 lines of email body as a fallback.

### Projects (entity type)
- `entities.type = 'project'`, metadata: `{status, description, target_date}`
- Tasks linked via `task_entities` with `role: 'project'`
- Auto-detected by Claude during ingest, or created via `PROJECT:` prefix
- `/projects` page lists active projects with task counts
- `/projects/[id]` detail view with tasks, status, wiki link

### Blocklist
- `blocklist` table: `pattern` (URL or email) + `type` ('url' or 'sender')
- Checked early in ingest pipeline (after dedupe, before processing)
- Managed via "Permanently Remove" in Resource Library or `/api/blocklist` API

### Entity resolution (`lib/entities.ts`)
- Exact match on `normalized_name` → fuzzy match → create new
- Aliases stored in `entity_aliases` table
- `pg_trgm` extension enabled with GIN indexes for future server-side fuzzy search
- Fuzzy threshold: 0.6 for short names, 0.4 for longer

### Entity merge (`/api/entities/merge`)
- **Atomic**: single Postgres RPC function (`merge_entities`) wrapping all 8 table operations in one transaction
- Moves entry_entities, task_entities, decision_entities, entity_relationships, entity_aliases, wiki_pages
- Handles duplicate prevention, self-referencing cleanup, first_seen/last_seen merge
- Deletes source entity after move

### External Data Sync

**Franchise Audits** (`/api/audits`, `/api/audits/sync`)
- Syncs from a Google Sheet (TMS audit data) every Monday 8am ET
- Stores scores in `franchise_audits` + `franchise_audit_snapshots` tables
- `/audits` page shows brand-level summary; `/audits/[brandEntityId]` shows per-franchisee scores
- Uses `xlsx` package for spreadsheet parsing

**NiceJob Reviews** (`/api/reviews`, `/api/reviews/sync`)
- Syncs from a Google Sheet every Monday 8am ET
- Stored in `nicejob_reviews` table with anomaly detection logic
- `/reviews` page visualizes review trends per brand

**KPIs** (`/api/kpis`, `/api/kpis/upload`)
- Brand-level KPI data uploaded via CSV/Excel file
- Stored with monthly/yearly aggregation; visualized via Recharts
- `/kpis` page (linked from Kitchen); `/kpis/[entityId]` per-brand detail with trend charts

### Kitchen / Tracking (`/tracking`)
- `tracking_items` table: pinned initiatives, data sources, and watched items
- `/tracking` page ("The Kitchen 🍳") shows pinned resources, initiatives, and links to `/kpis`
- Items can be pinned from the Resource Library

## Dashboard Features
- **Stat cards**: clickable, link to `/tasks` — "Escalated 🔥", "Waiting on You 👀", "Waiting on Them ⏳", "Open Tasks 📋", "Completed This Week ✅", "Watching 👁️". (Food-metaphor labels were retired — see commit a97e175.)
- **Priority sections**: Escalations, Needs Response, Overdue, Today's Tasks, **Inbox** (new/unreviewed tasks grouped by source entry), Watching (tracked), merged Overdue Follow-ups + Stale Tracking section grouped by person
- **Inbox**: replaces "The Basket". Shows new tasks (no due date, no waiting, no project), grouped by source dumpling. "Inbox Empty!" message when clear. Tasks leave the inbox once reviewed/scheduled.
- **Backlog**: separate section for tasks that have been reviewed but have no due date
- **Ask the Chef**: chat drawer (right slide-out) for querying wiki/tasks/decisions via Managed Agents
- **Dump box**: dedicated ingest input (top of page), separate from chat. Supports FYI:/TRACK:/RECEIPT:/NOTE:/PROJECT: prefixes
- **Smart ingest**: AI detects task intent (your task vs tracking vs FYI). Creates fewer, higher-level tasks
- **Public/private toggle** on any task — 🌐/🔒 in Actions. Public tasks visible at shared team URL
- **Task detail**: editable description (click to edit), due date picker, draft email generator, public toggle, tracking with auto-clear waiting_on
- **Task comments**: threaded discussion on each task via `task_comments` table. Accessible from detail panel.
- **Pending response dedup**: hidden from Needs Response if matching task exists, shown as "needs reply" badge on task instead. Auto-resolved on plate
- **Convert to task**: button on pending response detail
- **Entity cards**: team labels (blue badges), company dropdown (entities), franchisee assignment
- **Expandable dumplings**: click "show more" on truncated content in detail panels and brand pages
- **People grouped by relationships** — subgroups by brand/team via `member_of`/`works_on`
- **Topics list**: collapsible pills at bottom, click to edit/retype
- **Heatmap**: 10-day activity, hidden on mobile, Eastern time
- **Mobile**: hamburger menu, floating chat button, viewport meta, favicon, add-to-homescreen
- **"Brandy Murch"** displayed as "You" in waiting_on labels
- **Resource Library** (`/resources`): links only (receipts moved out — commit b2fadef). Pin to Kitchen, hide, delete, project association via dropdown. Bulk selection with floating action bar, "Permanently Remove" adds URL/sender to blocklist, icon/favicon/logo URL filtering at ingest + display

## Pages
- `/` — Dashboard overview (Inbox, priorities, stats, entity cards)
- `/tasks` — All filed tasks (view toggle: By Status / By Project / By Due Date, collapsible groups)
- `/board` — Kanban-style board view
- `/brand/[id]` — Individual brand detail (entities, wiki section, task list)
- `/projects` — Active projects with task counts
- `/projects/[id]` — Project detail (clickable tasks with slide-out detail panel, status, wiki link)
- `/wiki` — Wiki index + entity pages
- `/wiki/[slug]` — Wiki page view/edit
- `/history` — Dumpling history feed
- `/resources` — Resource Library (links only — receipts moved out). Pin to Kitchen, hide, delete, project association
- `/links` — Legacy alias for the Resource Library (kept for inbound links)
- `/tags` + `/tags/[tag]` — Tag browsing
- `/tracking` — **The Kitchen** 🍳 (initiatives, pinned resources, data sources)
- `/kpis` — KPI dashboard (linked from Kitchen)
- `/kpis/[entityId]` — Per-brand KPI detail with trend charts
- `/audits` — Franchise audit tracking (brand-level summary)
- `/audits/[brandEntityId]` — Per-brand franchise audit detail (franchisee scores)
- `/reviews` — NiceJob review tracking
- `/login` — Google OAuth sign-in
- `/public/watching?token=X` — Public read-only board (team can add items + comments)

## Source Layout
```
src/
├── app/                  # Next.js App Router (pages + API routes)
│   ├── api/              # 40+ API routes (see API Routes section below)
│   └── [pages]/          # Page components (one directory per route above)
├── components/
│   ├── ui/               # Shared: Header, Toast, StatusBadge, TaskCheckbox, AutoLinkText, LinkChips
│   ├── dashboard/        # BrandCards, EntityCards, DetailPanel, TaskDetail, Heatmap,
│   │                     #   MergeModal, EditEntityModal, Priorities, StatusSummary,
│   │                     #   PendingResponseDetail
│   ├── brand/            # BrandDetail, EntityList, WikiSection, CombineTasksModal
│   ├── chat/             # ChatPanel, ChatMessage, ChatInput
│   ├── kpi/              # TrendChart, BrandKpiDetail
│   ├── resources/        # LinksTab, WikiTab
│   └── Providers.tsx     # Client-side context provider
├── lib/
│   ├── ingest/           # index.ts, extract.ts, process.ts, resolve.ts,
│   │                     #   prefixes.ts, receipt.ts, urls.ts, compat.ts
│   ├── supabase/         # server.ts, browser.ts, middleware.ts
│   ├── auth.ts           # hasValidSession()
│   ├── allowed-emails.ts # ALLOWED_EMAILS enforcement
│   ├── claude.ts         # Direct API helpers
│   ├── managed-agents.ts # Managed Agents (chat) integration
│   ├── entities.ts       # Entity resolution + fuzzy matching
│   ├── postmark.ts       # Email sending
│   ├── email-html.ts     # Email templates
│   ├── wiki.ts           # Wiki generation
│   ├── wiki-queue.ts     # Wiki queue processing
│   ├── blocklist.ts      # Blocklist matching
│   ├── kpi-parser.ts     # KPI spreadsheet parsing
│   ├── escalation.ts     # Escalation logic
│   ├── rate-limit.ts     # Rate limiting
│   └── __tests__/        # Unit tests (Vitest)
├── hooks/
│   └── useChat.ts        # Chat state hook
├── types/
│   └── index.ts          # Core types: Entry, Task, Entity, IngestResult, etc.
└── middleware.ts          # Next.js auth middleware
```

## API Routes

**Ingest & Entries**
- `GET/POST /api/ingest` — Postmark webhook + paste/chat ingest
- `GET /api/entries/[id]` — Entry detail
- `POST /api/upload` — Attachment upload to Supabase Storage
- `GET /api/history` — Entry history feed

**Tasks**
- `GET/POST /api/tasks` — Task list + creation
- `GET/PATCH/DELETE /api/tasks/[id]` — Task detail
- `GET/POST /api/tasks/[id]/comments` — Task comment thread
- `GET/PATCH/DELETE /api/tasks/[id]/comments/[commentId]` — Comment detail
- `POST /api/tasks/merge` — Merge duplicate tasks
- `POST /api/tasks/draft-email` — AI email draft for a task

**Entities**
- `GET/POST /api/entities` — Entity list + creation
- `GET/PATCH /api/entities/[id]` — Entity detail
- `POST /api/entities/merge` — Atomic merge via Postgres RPC
- `POST /api/entities/link` — Create entity relationship
- `POST /api/entities/update` — Bulk update

**Chat**
- `POST /api/chat/session` — Create Managed Agent session
- `GET /api/chat/events` — Poll for session events

**Wiki**
- `GET /api/wiki` — Wiki index
- `GET/PATCH /api/wiki/[slug]` — Wiki page
- `POST /api/wiki/[slug]/instruct` — Add instruction to wiki page
- `POST /api/wiki/process` — Process wiki queue (also called by cron)

**Pending Responses**
- `GET /api/pending-responses` — Pending response list
- `PATCH /api/pending-responses/[id]` — Resolve/update

**Projects**
- `GET /api/projects` — Project list
- `GET/PATCH /api/projects/[id]` — Project detail

**Resources & Links**
- `GET /api/links` — Resource library
- `POST /api/blocklist` — Add to blocklist

**External Data**
- `GET /api/audits` — Franchise audit data
- `POST /api/audits/sync` — Google Sheets audit sync (also Vercel Cron)
- `GET /api/kpis` — Brand KPI data
- `POST /api/kpis/upload` — KPI file upload
- `GET /api/reviews` — NiceJob review data
- `POST /api/reviews/sync` — Google Sheets review sync (also Vercel Cron)

**Tracking / Kitchen**
- `GET/POST/DELETE /api/tracking` — Tracked item CRUD
- `GET /api/tracking/[id]` — Tracked item detail

**Dashboard & Misc**
- `GET /api/dashboard` — Dashboard aggregated data
- `GET /api/tags` — Tag list
- `GET /api/tags/[tag]` — Tag detail
- `GET /api/clarify` — AI clarification suggestions
- `POST /api/consolidation` — Consolidation suggestions

**Public**
- `GET /api/public/watching` — Public board
- `GET/POST /api/public/watching/comments` — Public board comments

**Cron (Vercel, GET)**
- `GET /api/cron/briefing` — Daily 7am ET
- `GET /api/cron/nudge` — Daily 2pm ET
- `GET /api/cron/digest` — Sunday 8pm ET
- `GET /api/cron/wiki` — Every 4 hours

**Auth**
- `GET /api/auth/callback` — Google OAuth callback

## Database Tables

**Core**
- `entries` — Raw dumps (email, paste, chat, meeting notes). Has `source`, `message_id`, `org_id`.
- `entities` — Brands, contacts, vendors, etc. Has `type`, `normalized_name`, `archived`, `metadata` (JSONB).
- `entity_aliases` — Alternate names / email addresses per entity
- `entity_relationships` — Typed links between entities (`member_of`, `works_on`, etc.)
- `entry_entities` — Many-to-many: dumps ↔ entities

**Tasks**
- `tasks` — Action items. Has `status`, `due_date`, `waiting_on`, `escalation`, `owner`, `is_public`, `tags` (array).
- `task_entities` — Links tasks to entities with `role` (`brand`, `assigned_to`, `vendor`, `topic`, `project`, `related`)
- `task_events` — Activity log (created, status_change, escalated, due_date_changed, nudged)
- `task_comments` — Threaded comments per task

**Decisions & Responses**
- `decisions` — Extracted decisions from entries
- `decision_entities` — Decision ↔ entity links
- `pending_responses` — Things needing a reply
- `pending_response_entities` — Response ↔ entity links

**Wiki & Resources**
- `wiki_pages` — Auto-generated entity pages. Has `pinned_sections` (JSONB) for human-written content.
- `wiki_queue` — Async wiki update queue (entry_id nullable for non-entry triggers)
- `saved_links` — Resource library. Has `pinned`, `hidden`, `project_id`, receipt metadata columns.
- `entry_links` — Links extracted from entries

**Email & Chat**
- `nudge_messages` — Nudge email log
- `nudge_message_tasks` — Nudge ↔ task links
- `conversations` — Chat sessions
- `messages` — Chat message history

**External Data**
- `nicejob_reviews` — NiceJob review data per brand (with anomaly detection)
- `franchise_audits` — Franchise audit fields (synced from Google Sheets)
- `franchise_audit_snapshots` — Historical audit scores per franchisee

**Config & Operations**
- `blocklist` — URL or sender patterns to ignore at ingest
- `tracking_items` — Kitchen pinned initiatives + data sources
- `clarifications` — AI-generated clarification suggestions

## Design
- **Theme**: Warm "dumpling vibes" — parchment background (`#faf6f1`) with warm radial gradients, cream cards (`#fff8f0`), amber accent (`#d4943a`), deep brown text (`#3d2c1e`)
- **Header**: Dark warm brown (`#2c2014`) with white text/logo
- **Stat cards**: `surface-hover` background, no borders
- **Icons**: Lucide React for UI actions, food emoji for personality
- **Logo**: Dumpling-in-box line art — `/public/logo-icon.png` (warm brown), `/public/logo-icon-white.png` (white for dark header)
- **Section headers**: bold with amber underline
- **Hero dump input**: amber left border accent
- **Charts**: Recharts (KPI trend lines)

## Security
- **Page + API auth** enforced by middleware (`src/lib/supabase/middleware.ts`). Server-only routes use `hasValidSession()` from `src/lib/auth.ts` when middleware exempts them (e.g., `/api/ingest` for Postmark webhooks)
- **Inbound webhook**: Postmark payload field validation (not signature — Postmark inbound doesn't sign)
- **Cron routes**: `CRON_SECRET` header
- **Auth callback**: redirect path validated (no open redirect)
- **CORS**: only `dumpbox.app` allowed (localhost removed)
- **Entity merge**: atomic Postgres RPC (no partial corruption)
- **Blocklist**: checked during email ingest only, RLS enabled

## Deploy
GitHub auto-deploy is wired up — pushes to `master` trigger a production build automatically. Manual deploy via Vercel API (fallback), substituting your IDs:
```bash
curl -sk -X POST -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" \
  "https://api.vercel.com/v13/deployments" \
  -d "{\"name\":\"second-brain\",\"project\":\"$VERCEL_PROJECT_ID\",\"gitSource\":{\"type\":\"github\",\"repoId\":$GITHUB_REPO_ID,\"ref\":\"master\"},\"target\":\"production\"}"
```

## Migrations
Located in `supabase/migrations/`. Applied: 001-030. Apply in order against a fresh Supabase project before first run.
- 001: initial schema (entries, entities, tasks, decisions, pending_responses, wiki_pages)
- 002: wiki tables
- 003: clarifications table
- 004: entity_relationships
- 005: attachments
- 006: RLS policies
- 007: wiki pinned_sections column
- 008: merge_entities RPC function
- 009: pg_trgm GIN indexes
- 010: wiki_queue table
- 011: consolidation_suggestions table
- 012: wiki_queue entry_id nullable (supports non-entry wiki triggers)
- 013: waiting_on column on tasks
- 015: nicejob_reviews table
- 016: entry_links table
- 017: saved_links table (resource library)
- 018: tracking_status / tracking_items
- 019: wiki edit tracking
- 020: tracked_items updates
- 021: task_entities `related` role
- 022: task `is_public` flag
- 023: saved_links `hidden` column
- 024: saved_links `pinned` column
- 025: task tags (array column)
- 026: task_comments table
- 027: task `owner` column
- 028: receipts (saved_links columns), blocklist table, task_entities project role, saved_links RLS
- 029: hidden entity IDs on saved_links
- 030: saved_links → project association

Seed data: `supabase/seed.sql` (10 brands, 2 internal team, 4 contacts, 2 vendors, 1 vendor team + aliases + relationships). Replace the seeded names/emails with your own team before deploying.

## Forking / Fresh Setup
First-time setup gotchas — read this before debugging "why won't it let me in":

1. **Supabase project**: create a new project. Enable the `pg_trgm` extension (Dashboard → Database → Extensions). Run every migration in `supabase/migrations/` in order. Replace `supabase/seed.sql` with your own team's emails/brands before running it.
2. **Google OAuth provider**: configure in Supabase → Authentication → Providers → Google. Add your callback URL (`https://your-domain/auth/callback` and the Supabase default).
3. **`ALLOWED_EMAILS` env var** — required, comma-separated lowercase. **If unset or your email isn't in it, every successful Google sign-in still bounces to `/login`.** Set in Vercel (all targets you use) and in `.env.local`.
4. **Single-org assumption**: `ORG_ID` is hardcoded to `00000000-0000-0000-0000-000000000001`. Everything is scoped to this one org. Don't try to remove it without rewriting auth + RLS.
5. **Postmark inbound**: webhook is unsigned (Postmark doesn't sign inbound) — we validate payload field presence only. If you're worried, add IP allowlisting. Inbound address routes to `/api/ingest`.
6. **Anthropic Managed Agents** (chat): you'll need your own `MANAGED_AGENT_ID` and `MANAGED_ENVIRONMENT_ID`. The agent must be configured with the write tools listed under Chat above.
7. **Cron jobs**: defined in `vercel.json`. They call routes protected by `CRON_SECRET` — set this env var or every cron call will 401.
8. **All env vars**: see `.env.example`. None of them have meaningful defaults.

Old/stale references to "Render" in the codebase are not active — hosting is Vercel (commit 23d5b8a reverted the Render move).

## Known Issues
- Postmark account pending approval — outbound to non-`@dumpbox.app` addresses blocked
- Dashboard N+1 query on entity task summaries — will slow at ~100+ entities
- RLS policies don't check user identity, only org_id — middleware is sole auth gate
- Wiki backlog: ~1600 pages pending, processing ~48/day via cron
- Chat (Ask the Chef) may need Managed Agent session debugging

## Security Notes
- `.env.local` never committed to git ✓
- Service role key server-side only ✓
- All routes authenticated ✓
- Rate limiting on ingest (30/min), upload (10/min), public watching (30/min)
- Postmark webhook validates field presence only (no IP whitelist yet)
- Public share token in URL query param (acceptable for internal team use)
- Error responses may leak Supabase details (refactor to generic errors later)
- CORS allows GET from any origin (mutations blocked to allowed origins only)

## Conventions
- Use `force-dynamic` on all API routes
- Use `getServiceClient()` for server-side Supabase (bypasses RLS)
- Postmark inbound: check payload fields, not signature
- Auth callback: validated redirect path
- CORS: `/api/ingest` and `/api/cron/*` exempted from origin checks
- `ensureArray()` for all Claude tool input iteration
- Entity types: `brand`, `department`, `franchisee`, `contact`, `vendor`, `vendor_team`, `freelancer`
- Relationship types: `member_of`, `works_on`, `works_at`, `franchisee_of`, `manages`, `reports_to`, `works_for`, `works_with`, `contracted_by`, `supplies`
- All dashboard dates use Eastern time (`America/New_York`)
- Tests: Vitest (`src/lib/__tests__/`), run with `npm test`
