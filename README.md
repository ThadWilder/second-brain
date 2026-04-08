# Marketing Second Brain

Automated knowledge base and task engine for Threshold Brands marketing operations. Built on Airtable + OpenAI + Postmark + Render.

**Brands managed:** MaidPro · Mold Medics · Granite Garage Floors · USA Insulation · Miracle Method · Heating & Air Paramedics · Plumbing Paramedics · Men in Kilts · Pestmaster

---

## How It Works

1. Raw content enters the **Inbox** via form, email forward, or manual entry
2. Airtable's native AI fields run automatically and enrich the record
3. A webhook fires to this server the moment a new record is created
4. The server calls GPT-4o, which reads the full content — including attachment text — and analyzes it
5. Tasks and Decisions are created automatically in the right tables
6. The Inbox record is marked Triaged or Tasks Created

You never touch the backend. You dump content in, the brain handles the rest.

---

## Input Channels

| Channel | How |
|---|---|
| Manual / Teams / Meeting notes | Fill out the Inbox form: https://airtable.com/app3fQnVHX8w2BOD4/shrWMWmzTzL257izu |
| Email forward | Forward to `8887764d24c05426ea28ca03630b999e@inbound.postmarkapp.com` → lands in Inbox with full body + attachments |
| Direct Airtable entry | Add a record directly to the Inbox table |

### Email Forwarding — What Gets Preserved
- Full email body (plain text preferred, HTML stripped cleanly)
- All URLs in the body — intact, no stripping
- Attachments: PDF, Word (.docx/.doc), and .txt files are fully read and their text appended to Raw Content so the brain analyzes them
- Images and binary files: logged by name so you know they exist

---

## Airtable Base

| Item | Value |
|---|---|
| Base ID | `app3fQnVHX8w2BOD4` |
| Inbox Form | https://airtable.com/app3fQnVHX8w2BOD4/shrWMWmzTzL257izu |
| Leadership Board | https://airtable.com/app3fQnVHX8w2BOD4/pagsCBfSNWDrwTjyW |

---

## Tables

| Table | ID | Purpose |
|---|---|---|
| Brands | `tblMYUnIWZepnUUPT` | Master brand list with rollup metrics |
| Inbox | `tbloCoqAPsj1MF680` | Everything comes in here first |
| Tasks | `tblcwCcjVI4iuqI2X` | All action items across brands |
| Campaigns | `tblGTzCJrwvs2PF2A` | Active and planned campaigns |
| Decisions Log | `tbl0sVS3CI8sJrrEn` | Documented decisions with rationale |
| Initiatives | `tblkR37ej5Di2htQo` | Master initiative tracker (migrated from Google Sheets) |
| Idea Initiatives | `tbl5ohdxYInX2c67i` | Ideas pipeline |
| Singular Zee Initiatives | `tblBTtSrzGNs5bx9W` | Location-specific initiatives |
| Initiative Catalog | `tbljKVrr96fcs9oom` | Reference catalog of initiative types |
| Change Management | `tblUgf674k04p0mp1` | Change tracking and comms |
| Cost Savings | `tblRxhg55Oh9xDeaE` | Vendor negotiations and savings log |

---

## Inbox AI Fields

Three fields on the Inbox table that run automatically when a record is created or updated. Set up in Airtable UI under **"Create custom agent"** using `{Raw Content}` as input.

### AI Summary
```
Summarize the following notes in 2-3 sentences. Focus on what matters operationally — key updates, decisions, or context.

{Raw Content}
```

### AI Next Actions
```
Extract every action item from the following notes as a bulleted list. Format each as:
[Owner if mentioned] — [Action] — [Deadline if mentioned]
If no owner is clear, write "Brandy."

{Raw Content}
```

### AI Priority Signal
```
Classify the following notes into exactly one of these categories:
"Urgent — Act Today", "Needs Task", "FYI Only", or "Archive."
Return only the category label, nothing else.

{Raw Content}
```

---

## Inbox Status Flow

```
New → Triaged → Tasks Created → Archived
```

| Status | Meaning |
|---|---|
| New | Just arrived, not yet processed |
| Triaged | Brain has analyzed it, no tasks needed |
| Tasks Created | One or more tasks were created from this record |
| Archived | Done, no further action needed |

---

## Airtable Views

### Inbox Table
| View | Filter |
|---|---|
| 📥 Needs Triage | Status = New |

### Tasks Table
| View | Filter |
|---|---|
| 🔥 What Matters Now | Status = Not Started or In Progress, Priority = P1 Now |
| ⏳ Waiting on Others | Status = Waiting on Other |
| ✅ Done This Week | Status = Done, completed this week |

### Leadership Board Interface Pages
| Page | Contents |
|---|---|
| Brand Leadership Board | Brand grid with Open Tasks + Blocked counts |
| 📋 Decisions Log | All decisions sorted by date, by brand |
| 🔍 By Brand | All tasks grouped by brand |

---

## Webhook Server (this repo)

### Endpoints

| Endpoint | Trigger | Purpose |
|---|---|---|
| `GET /` | Health check | Returns "Second Brain is running." |
| `POST /process-inbox` | Airtable webhook | Fires when new Inbox record created |
| `POST /inbound-email` | Postmark webhook | Fires when email is forwarded in |

**Base URL:** `https://second-brain-xow4.onrender.com`

### Airtable Webhook
- Webhook ID: `achQd6c5zkr0h0sFm`
- Fires on: new record created in Inbox table (`tbloCoqAPsj1MF680`)
- Auto-renews every 6 days (Airtable webhooks expire after 7)

### Postmark Inbound Email
- Inbound address: `8887764d24c05426ea28ca03630b999e@inbound.postmarkapp.com`
- Postmark inbound webhook URL: `https://second-brain-xow4.onrender.com/inbound-email`
- Forward emails to the inbound address above
- Server parses: From, Subject, body text, and all readable attachments
- Creates Inbox record then immediately triggers brain analysis

### What the server does on each Inbox record
1. Fetches the record (Raw Content, Brand, Title, Source)
2. Loads all existing Tasks — for deduplication
3. Loads all Initiatives — for cross-linking
4. Calls GPT-4o with the full brain prompt
5. Creates Tasks in the Tasks table (all of them, no limit)
6. Creates Decisions in the Decisions Log table
7. Updates Inbox Status to Triaged or Tasks Created

### Attachment Handling (email only)
| File type | Behavior |
|---|---|
| PDF | Full text extracted via `pdf-parse`, appended to Raw Content |
| Word (.docx / .doc) | Full text extracted via `mammoth`, appended to Raw Content |
| Plain text (.txt) | Read directly, appended to Raw Content |
| Images / Excel / other | Logged by filename — brain knows it exists |

### Brand Auto-Detection (email)
The server detects brand from email subject + body automatically. Supports:
- Full brand names (case-insensitive)
- Abbreviations: `ggf` → Granite Garage Floors, `usai` → USA Insulation, `mik` → Men in Kilts, `h&a` → Heating & Air Paramedics

---

## GPT-4o Brain Prompt

```
You are the marketing operations brain for Brandy Murch, a franchise marketing director managing these brands: MaidPro, Mold Medics, Granite Garage Floors, USA Insulation, Miracle Method, Heating & Air Paramedics, Plumbing Paramedics, Men in Kilts, Pestmaster.

Analyze the following inbox item and return a complete JSON object with your analysis.

INBOX ITEM:
Title: {title}
Brand: {brand}
Source: {source}
Content: {raw_content}

EXISTING TASKS (do not duplicate):
{existing_tasks}

EXISTING INITIATIVES (match by topic/name if relevant):
{initiatives}

Return ONLY a valid JSON object with this exact structure:
{
  "category": "one of: Decision | Action | Update | Blocker | FYI | Idea | Finance",
  "topic": "2-5 word topic tag",
  "summary": "2-3 sentence summary with enough detail to act without reading the original",
  "urgency": "Today | This Week | This Month | No Rush",
  "related_initiative": "exact initiative name if matched, or null",
  "tasks": [
    {
      "task_name": "clear short action title",
      "owner": "Brandy or name if specified",
      "priority": "P1 Now | P2 Soon | P3 Someday",
      "due_date": "YYYY-MM-DD or null",
      "notes": "enough context to act without reading the original"
    }
  ],
  "decisions": [
    {
      "decision": "what was decided",
      "made_by": "who decided or empty string",
      "rationale": "why this decision was made",
      "impact": "High | Medium | Low"
    }
  ]
}

Rules:
- tasks: include ALL actionable items. Leave as empty array [] if nothing to do.
- decisions: include only if a real decision was documented. Leave as empty array [] if none.
- Do NOT create tasks that already exist in the existing tasks list.
- Return ONLY the JSON object, no other text.
```

---

## Cross-Brand Weekly Review Prompt

Use manually in ChatGPT or add as a weekly automation. Paste a dump of current Inbox + Tasks.

```
You are reviewing the weekly marketing operations status for Threshold Brands.
Below is a summary of active inbox items and open tasks across all brands.

[PASTE INBOX + TASKS EXPORT HERE]

Return:
1. Brand risk ranking (most at-risk to least)
2. Shared blockers affecting multiple brands
3. Critical flags needing attention this week
4. Items waiting on others — who and what
5. Top 3 things to delegate immediately
```

---

## Environment Variables (Render)

| Variable | Value |
|---|---|
| `OPENAI_API_KEY` | Your OpenAI API key |
| `AIRTABLE_TOKEN` | Your Airtable personal access token |
| `AIRTABLE_BASE_ID` | `app3fQnVHX8w2BOD4` |
| `WEBHOOK_ID` | `achQd6c5zkr0h0sFm` |

---

## Deployment

Hosted on Render. Auto-deploys from `brandymurch/second-brain` on every push to `master`.

```bash
# Deploy an update
git add .
git commit -m "your message"
git push
```

Render picks it up automatically within ~2 minutes.

---

## Dependencies

| Package | Purpose |
|---|---|
| `express` | HTTP server |
| `airtable` | Airtable API client |
| `openai` | GPT-4o API client |
| `pdf-parse` | Extract text from PDF attachments |
| `mammoth` | Extract text from Word (.docx/.doc) attachments |
| `dotenv` | Local environment variable loading |
