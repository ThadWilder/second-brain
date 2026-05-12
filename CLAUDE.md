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
- **Supabase**: project `duohzmiicitrskitmsgo`
- **Vercel**: project `prj_alea21zo0mlDm6VKxShnxF2AJWob`
- **Postmark**: server `second-brain`, inbound hash `8887764d`
- **Managed Agent**: `agent_011CZv7UFycAxkYUM9MrxSXv`, env `env_01WfxP2sgGKrqLTDkTG1p2Eb`
- **Org ID**: `00000000-0000-0000-0000-000000000001` (single-org, hardcoded)

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
- `RECEIPT:` — triggers receipt-specific ingest path (skip tasks, extract receipt metadata, save to saved_links)
- `NOTE:` — attaches user note to the dumpling, passed as context to Claude
- `PROJECT:` — tags ingest with a project entity, auto-creates if new
- Prefixes are case-insensitive, can appear anywhere in subject (survives Fwd:/Re:), and can be combined

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

## Dashboard Features
- **Stat cards**: clickable — "On Fire 🔥", "Waiting on You 👀", "Waiting on Them ⏳", "In the Steamer 🥟", "Plated This Week ✨", "Simmering ♨️" (tracked tasks)
- **Priority sections**: Escalations, Needs Response, Overdue, Today's Tasks, The Basket (inbox grouped by brand), Simmering (tracked), Overdue Follow-ups, Stale Tracking
- **The Basket**: tasks grouped by brand with health dots (🔴🟡🟢), search filter, bulk dismiss/merge checkboxes, task age labels
- **Ask the Chef**: chat drawer (right slide-out) for querying wiki/tasks/decisions via Managed Agents
- **Dump box**: dedicated ingest input (top of page), separate from chat. Supports FYI:/TRACK:/RECEIPT:/NOTE:/PROJECT: prefixes
- **Smart ingest**: AI detects task intent (your task vs tracking vs FYI). Creates fewer, higher-level tasks
- **Public/private toggle** on any task — 🌐/🔒 in Actions. Public tasks visible at shared team URL
- **Task detail**: editable description (click to edit), due date picker, draft email generator, public toggle, tracking with auto-clear waiting_on
- **Pending response dedup**: hidden from Needs Response if matching task exists, shown as "needs reply" badge on task instead. Auto-resolved on plate
- **Convert to task**: button on pending response detail
- **Entity cards**: team labels (blue badges), company dropdown (entities), franchisee assignment
- **Expandable dumplings**: click "show more" on truncated content in detail panels and brand pages
- **People grouped by relationships** — subgroups by brand/team via `member_of`/`works_on`
- **Topics list**: collapsible pills at bottom, click to edit/retype
- **Heatmap**: 10-day activity, hidden on mobile, Eastern time
- **Mobile**: hamburger menu, floating chat button, viewport meta, favicon, add-to-homescreen
- **"Brandy Murch"** displayed as "You" in waiting_on labels
- **Resource Library**: Filter tabs (All/Links/Receipts), receipt cards with metadata editing + download, bulk selection with floating action bar, "Permanently Remove" with blocklist, icon/favicon/logo URL filtering

## Pages
- `/` — Dashboard (The Basket, priorities, stats, entity cards)
- `/tracking` — **The Kitchen** 🍳 (initiatives, pinned resources, data sources)
- `/wiki` — Wiki index + entity pages
- `/history` — Dumpling history feed
- `/links` — Resource Library (pin to Kitchen, hide/delete)
- `/kpis` — KPI dashboard (linked from Kitchen)
- `/audits` — Franchise audit tracking
- `/reviews` — NiceJob review tracking
- `/projects` — Projects list (active projects with task counts)
- `/projects/[id]` — Project detail (tasks, status, wiki link)
- `/public/watching?token=X` — Public read-only board (team can add items)

## Design
- **Theme**: Warm "dumpling vibes" — parchment background (`#faf6f1`) with warm radial gradients, cream cards (`#fff8f0`), amber accent (`#d4943a`), deep brown text (`#3d2c1e`)
- **Header**: Dark warm brown (`#2c2014`) with white text/logo
- **Stat cards**: `surface-hover` background, no borders
- **Icons**: Lucide React for UI actions, food emoji for personality
- **Logo**: Dumpling-in-box line art — `/public/logo-icon.png` (warm brown), `/public/logo-icon-white.png` (white for dark header)
- **Section headers**: bold with amber underline
- **Hero dump input**: amber left border accent

## Security
- **All 14 API routes** require `hasValidSession()` auth check
- **Inbound webhook**: Postmark payload field validation (not signature — Postmark inbound doesn't sign)
- **Cron routes**: `CRON_SECRET` header
- **Auth callback**: redirect path validated (no open redirect)
- **CORS**: only `dumpbox.app` allowed (localhost removed)
- **Entity merge**: atomic Postgres RPC (no partial corruption)
- **Blocklist**: checked during email ingest only, RLS enabled

## Deploy
```bash
curl -sk -X POST -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" \
  "https://api.vercel.com/v13/deployments" \
  -d '{"name":"second-brain","project":"prj_alea21zo0mlDm6VKxShnxF2AJWob","gitSource":{"type":"github","repoId":1204368059,"ref":"master"},"target":"production"}'
```
GitHub auto-deploy is NOT linked -- deploys are manual via Vercel API.

## Migrations
Located in `supabase/migrations/`. Applied: 001-029.
- 001: initial schema
- 002: wiki
- 003: clarifications
- 004: entity relationships
- 005: attachments
- 006: RLS
- 007: wiki pinned sections
- 008: merge entities RPC
- 009: pg_trgm indexes
- 010: wiki queue
- 028: receipts (saved_links columns), blocklist table, task_entities project role, saved_links RLS
- 029: hidden entity IDs on saved_links

Seed data: `supabase/seed.sql` (10 brands, 2 internal team, 4 contacts, 2 vendors, 1 vendor team + aliases + relationships)

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
