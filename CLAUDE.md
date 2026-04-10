# Dumpbox

**Personal chaos organizer for Threshold Brands marketing team.**
Items dumped into the app are called **dumplings**. The morning briefing email is called **Dim Sum**.

## Stack
- **Framework**: Next.js 14.2.3 (App Router)
- **Database**: Supabase (Postgres + RLS)
- **AI**: Anthropic Claude (direct API for cron routes, Managed Agents for chat)
- **Email**: Postmark (inbound via `dump@dumpbox.app`, outbound from `briefing@dumpbox.app`)
- **Hosting**: Vercel (hobby plan, 10s serverless timeout)
- **Domain**: `dumpbox.app` (Cloudflare DNS)
- **Auth**: Google OAuth via Supabase Auth

## Key IDs
- **Supabase**: project `duohzmiicitrskitmsgo`
- **Vercel**: project `prj_alea21zo0mlDm6VKxShnxF2AJWob`
- **Postmark**: server `second-brain`, inbound hash `8887764d`
- **Managed Agent**: `agent_011CZv7UFycAxkYUM9MrxSXv`, env `env_01WfxP2sgGKrqLTDkTG1p2Eb`
- **Org ID**: `00000000-0000-0000-0000-000000000001` (single-org, hardcoded)

## Team & Entities
- **Team**: Michelle, Dustin, Amanda (NOT Jack)
- **Vendors**: Moe (SEO), Red Brick (legacy)
- **10 brands**: MaidPro, USA Insulation, Pestmaster, Men In Kilts, Mold Medics, Miracle Method, Granite Garage Floors, PHP (Plumbing & Heating Paramedics), HAP (Heating & Air Paramedics), PLP (Plumbing Paramedics)

## Architecture

### Ingest pipeline (`/api/ingest`)
1. Accepts email (Postmark webhook), paste, chat, meeting notes
2. Dedupes by message ID
3. Uploads attachments to Supabase Storage
4. Calls Claude to extract: tasks, decisions, pending responses, entities
5. Resolves entities via fuzzy matching + aliases
6. Updates wiki pages for mentioned brands
7. Returns structured `IngestResult` with counts

### Chat (`/api/chat/*`)
- Uses Anthropic Managed Agents (not direct API)
- Session: `agent_reference` format, `environment` (not `environment_id`)
- Events: type `"user"` (not `"user.message"`), tool results: type `"tool_result"` with `tool_use_id`
- Polling: `GET /events?order=asc&limit=100` (not SSE, no after_id)
- Beta header: `agent-api-2026-03-01`

### Cron routes
- `/api/cron/briefing` — "Dim Sum" morning briefing via Claude + Postmark
- `/api/cron/digest` — weekly digest
- `/api/cron/nudge` — stale task nudges
- All protected by `CRON_SECRET` in Authorization header
- All have try-catch with structured error responses

### Entity resolution (`lib/entities.ts`)
- Exact match on `normalized_name` → fuzzy match → create new
- Aliases stored in `entity_aliases` table
- Fuzzy threshold: 0.25 (known issue: too low for short names)

## Design
- **Theme**: Warm "dumpling vibes" — parchment background (`#faf6f1`), cream cards (`#fff8f0`), amber accent (`#d4943a`), deep brown text (`#3d2c1e`)
- **Header**: Dark warm brown (`#2c2014`) with white text/logo
- **Background**: SVG pattern of dumplings, woks, chopsticks, bamboo steamers
- **Stat cards**: Fun labels — "On Fire 🔥", "Waiting on You 👀", "In the Steamer 🥟", "Plated This Week ✨"
- **Icons**: Lucide React for UI actions, food emoji for personality
- **Logo**: Dumpling-in-box line art at `/public/logo-icon.png` (warm brown) and `/public/logo-icon-white.png` (white for dark header)

## Deploy
```bash
curl -sk -X POST -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" \
  "https://api.vercel.com/v13/deployments" \
  -d '{"name":"second-brain","project":"prj_alea21zo0mlDm6VKxShnxF2AJWob","gitSource":{"type":"github","repoId":1204368059,"ref":"master"},"target":"production"}'
```
GitHub auto-deploy is NOT linked — deploys are manual via Vercel API.

## Migrations
Located in `supabase/migrations/`. Applied: 001-006.
Seed data: `supabase/seed.sql` (10 brands, 3 team, 2 vendors).

## Known Issues
- Postmark account pending approval — outbound to non-`@dumpbox.app` addresses blocked
- Vercel hobby plan 10s timeout — cron routes and chat events can exceed this
- Dashboard N+1 query on entity task summaries — will timeout at scale
- Merge route has no atomicity — partial failures corrupt entity graph
- RLS policies don't check user identity, only org_id
- Fuzzy match threshold too low for short names ("Moe" matches "Joe")
- See full audit: QA report generated 2026-04-10 (99 issues)

## Conventions
- Use `force-dynamic` on all API routes
- Use `getServiceClient()` for server-side Supabase (bypasses RLS)
- Postmark webhook verification: fail closed when secret not configured
- Auth callback: validated redirect path (no open redirect)
- CORS: `/api/ingest` and `/api/cron/*` exempted from origin checks
