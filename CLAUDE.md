# Dumpbox

**Personal chaos organizer for Threshold Brands marketing team.**
Items dumped into the app are called **dumplings**. The morning briefing email is called **Dim Sum**.

## Stack
- **Framework**: Next.js 14.2.3 (App Router)
- **Database**: Supabase (Postgres + RLS + pg_trgm extension)
- **AI**: Anthropic Claude (direct API for ingest/cron, Managed Agents for chat)
- **Email**: Postmark (inbound via `dump@dumpbox.app`, outbound from `briefing@dumpbox.app`)
- **Hosting**: Vercel Pro plan (60s serverless, 300s for wiki processor)
- **Domain**: `dumpbox.app` (Cloudflare DNS)
- **Auth**: Google OAuth via Supabase Auth

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

### Cron routes
- `/api/cron/briefing` — "Dim Sum" morning briefing via Claude + Postmark (blocked until Postmark account approved)
- `/api/cron/digest` — weekly digest
- `/api/cron/nudge` — stale task nudges
- All protected by `CRON_SECRET` in Authorization header
- All have try-catch with structured error responses
- All have `maxDuration = 60`

### Entity resolution (`lib/entities.ts`)
- Exact match on `normalized_name` → fuzzy match → create new
- Aliases stored in `entity_aliases` table
- `pg_trgm` extension enabled with GIN indexes for future server-side fuzzy search
- Fuzzy threshold: 0.25 (known issue: too low for short names)

### Entity merge (`/api/entities/merge`)
- **Atomic**: single Postgres RPC function (`merge_entities`) wrapping all 8 table operations in one transaction
- Moves entry_entities, task_entities, decision_entities, entity_relationships, entity_aliases, wiki_pages
- Handles duplicate prevention, self-referencing cleanup, first_seen/last_seen merge
- Deletes source entity after move

## Dashboard Features
- **Stat cards**: fun labels — "On Fire 🔥", "Waiting on You 👀", "In the Steamer 🥟", "Plated This Week ✨"
- **Collapsible entity sections** with counts — `CollapsibleSection` shared component
- **People grouped by relationships** — subgroups by brand/team via `member_of`/`works_on`
- **Inline team assignment** — dropdown on all contact cards to add brand/team links
- **Entity type selector** in edit modal — change anyone from Team Member to Franchisee etc.
- **Archive** — hide entities from dashboard, preserve history
- **Task detail slide-out panel** — status controls, escalation toggle, linked entities with inline add, source dumpling, event timeline, notes
- **Pending response detail panel** — mark as responded, source dumpling, notes
- **Clarification source panel** — click "Source" to see full original dumpling + entity resolution status
- **Heatmap**: 10-day activity, weekend columns dimmed, Eastern time
- **All dates in Eastern time**

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

## Deploy
```bash
curl -sk -X POST -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" \
  "https://api.vercel.com/v13/deployments" \
  -d '{"name":"second-brain","project":"prj_alea21zo0mlDm6VKxShnxF2AJWob","gitSource":{"type":"github","repoId":1204368059,"ref":"master"},"target":"production"}'
```
GitHub auto-deploy is NOT linked — deploys are manual via Vercel API.

## Migrations
Located in `supabase/migrations/`. Applied: 001-010.
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

Seed data: `supabase/seed.sql` (10 brands, 2 internal team, 4 contacts, 2 vendors, 1 vendor team + aliases + relationships)

## Known Issues
- Postmark account pending approval — outbound to non-`@dumpbox.app` addresses blocked
- Dashboard N+1 query on entity task summaries — will slow at ~50-100 entities
- Fuzzy match threshold too low for short names ("Moe" matches "Joe")
- RLS policies don't check user identity, only org_id — middleware is sole auth gate
- No multi-user scoping within org yet (team members see same dashboard)
- Mobile not responsive (GitHub #1)
- Full QA audit generated 2026-04-10 (99 issues, most critical fixed)

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
