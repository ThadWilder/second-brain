# Second Brain

AI-powered operational command center for managing multiple brands at Threshold Marketing Services.

You dump raw information — emails, Teams messages, meeting notes, thoughts — and the system classifies, extracts, links, and surfaces what matters.

**Goal:** Walk in Monday morning, open it, and it tells you what happened, what's on fire, and what to do first. Never go looking for anything.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router, TypeScript, Tailwind) |
| Backend | Next.js API routes (no separate backend) |
| Database | Supabase (Postgres + pgvector) |
| Ingestion AI | Claude API — single tool-use call |
| Chat AI | Claude Managed Agents — multi-turn sessions |
| Briefings AI | Claude API — direct call, no Managed Agents |
| Email | Postmark (inbound webhook + outbound) |
| Scheduling | Vercel Cron |

---

## Setup

### 1. Supabase

Create a new Supabase project. Run the migration:

```bash
# Via Supabase CLI
supabase db push

# Or manually: paste supabase/migrations/001_initial_schema.sql
# into the Supabase SQL editor and run it.
```

### 2. Managed Agents (Anthropic)

Create the Agent and Environment once using the `ant` CLI:

```bash
# Install Anthropic CLI
npm install -g @anthropic-ai/cli

# Create the agent
ant agents create \
  --name "Second Brain Assistant" \
  --model claude-sonnet-4-5 \
  --system "You are a brand operations assistant. You have access to the user's brand management data. Answer questions from the data. Update tasks and log decisions when the user tells you something is done or makes a decision. Be concise. Lead with the answer."

# Create an environment
ant environments create --name "second-brain-prod"

# Note the returned IDs for MANAGED_AGENT_ID and MANAGED_ENVIRONMENT_ID
```

### 3. Postmark

- Create a Postmark account and a Server
- Set up an Inbound webhook pointing to `https://your-app.vercel.app/api/ingest`
- Set DKIM and return-path for outbound

### 4. Environment variables

Copy `.env.example` to `.env.local` and fill in all values:

```bash
cp .env.example .env.local
```

### 5. Deploy

```bash
# Vercel
vercel deploy

# Configure Vercel Cron in vercel.json (see below)
```

---

## Vercel Cron

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/briefing",
      "schedule": "0 14 * * *"
    },
    {
      "path": "/api/cron/nudge",
      "schedule": "0 21 * * *"
    },
    {
      "path": "/api/cron/digest",
      "schedule": "0 3 * * 1"
    }
  ]
}
```

Times are UTC. Adjust for your timezone (Arizona = UTC-7, no DST):
- Briefing: `0 14 * * *` = 7am AZ
- Nudge: `0 21 * * *` = 2pm AZ
- Digest: `0 3 * * 1` = Sunday 8pm AZ

Cron routes require `Authorization: Bearer <CRON_SECRET>` header. Vercel automatically adds this for Cron.

---

## Architecture

### Ingest pipeline

```
POST /api/ingest
  ↓
Dedupe by source_dedupe_key (Postmark MessageID or UUID)
  ↓
Single Claude API call (tool use):
  classify_entities → entity resolution → upsert
  create_tasks → task_events: created
  log_decisions → decision_entities
  flag_pending_response → pending_response_entities
  ↓
processing_status = 'done'
```

### Chat (Managed Agents)

```
Frontend → POST /api/chat/events (SSE)
  ↓
Managed Agent session (multi-turn)
  ↓ tool_use events
Execute tool against Supabase server-side
  ↓ tool_result
Agent continues → content_delta → frontend
```

### Scheduled jobs

```
External cron → POST /api/cron/briefing
  ↓
Query Supabase → Claude API → Postmark
```

---

## Entity resolution

Three-layer resolution on every ingestion:

1. **Claude-first** — existing entity names + IDs injected into system prompt. Claude returns matched IDs or signals "new entity".
2. **Alias lookup** — `entity_aliases.normalized_alias` exact match
3. **Fuzzy fallback** — `normalized_name` ILIKE + bigram similarity

New aliases are automatically added when Claude matches a variant to an existing entity.

---

## Escalation rules

| Condition | Result |
|-----------|--------|
| `due_date < today` AND `status = 'open'` | Auto-escalate |
| `waiting_on` set AND `updated_at` > 48hrs ago | Auto-escalate |
| Nudged 3+ times, no response | Auto-escalate |
| `pending_response` older than 24hrs | Surface as "needs response" |
| Task marked done | Auto-de-escalate |
| New `task_events` row linked to task | Auto-de-escalate |
| `due_date` pushed forward | Auto-de-escalate |

Escalation pass runs at the start of each morning briefing.

---

## Closing a task — three ways

1. **Checkbox** in Zone 3 — one click
2. **Chat** — "maidpro social is done"
3. **Email reply** — reply to a nudge, flows through ingest pipeline

---

## V2 roadmap

- pgvector semantic search (when corpus outgrows SQL context)
- Auth + multi-tenancy (RLS policies, login)
- Async ingestion queue (Inngest/Trigger.dev)
- Attachment handling (PDFs, images from Postmark)
- Entity relationship graph visualization
- Vendor scorecards
- Teams/Outlook API integration
