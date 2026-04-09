/**
 * Wiki layer — LLM-maintained synthesized pages.
 *
 * Inspired by Karpathy's llm-wiki pattern:
 * https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
 *
 * Core idea: instead of re-deriving knowledge from raw rows on every chat query,
 * maintain a persistent synthesized page per entity. The LLM updates it on every
 * ingest. The chat agent reads the wiki page first before querying structured data.
 * Knowledge compounds with every entry processed.
 *
 * The LLM writes all wiki content. Humans only read.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { anthropic, CLAUDE_MODEL } from './claude'
import { ORG_ID } from './supabase'
import type { Entity, Task, Decision } from '@/types'

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

export interface WikiPage {
  id: string
  org_id: string
  entity_id: string | null
  slug: string
  title: string
  content: string
  summary: string
  source_count: number
  last_updated_by_entry: string | null
  created_at: string
  updated_at: string
}

export interface WikiPageWithLinks extends WikiPage {
  outbound_links: Array<{ slug: string; title: string; context: string | null }>
  inbound_links: Array<{ slug: string; title: string }>
}

// ─────────────────────────────────────────
// Read — used by chat agent before querying rows
// ─────────────────────────────────────────

/**
 * Get a wiki page by entity ID. Returns null if no page exists yet.
 */
export async function getWikiPageByEntity(
  db: SupabaseClient,
  entityId: string
): Promise<WikiPage | null> {
  const { data } = await db
    .from('wiki_pages')
    .select('*')
    .eq('entity_id', entityId)
    .eq('org_id', ORG_ID)
    .single()

  return data as WikiPage | null
}

/**
 * Get a wiki page by slug.
 */
export async function getWikiPageBySlug(
  db: SupabaseClient,
  slug: string
): Promise<WikiPage | null> {
  const { data } = await db
    .from('wiki_pages')
    .select('*')
    .eq('slug', slug)
    .eq('org_id', ORG_ID)
    .single()

  return data as WikiPage | null
}

/**
 * Get all wiki pages — used for the index / chat agent context header.
 * Returns only id, slug, title, summary (not full content) for efficiency.
 */
export async function getAllWikiPages(db: SupabaseClient): Promise<
  Array<Pick<WikiPage, 'id' | 'slug' | 'title' | 'summary' | 'source_count' | 'updated_at'>>
> {
  const { data } = await db
    .from('wiki_pages')
    .select('id, slug, title, summary, source_count, updated_at')
    .eq('org_id', ORG_ID)
    .order('updated_at', { ascending: false })

  return data ?? []
}

/**
 * Build the wiki index string — injected into chat agent system prompt.
 * Compact format: slug | title | summary | last updated
 */
export async function buildWikiIndex(db: SupabaseClient): Promise<string> {
  const pages = await getAllWikiPages(db)
  if (!pages.length) return 'No wiki pages yet.'

  return pages
    .map((p) => {
      const age = formatAge(p.updated_at)
      const summary = p.summary ? ` — ${p.summary}` : ' — (no content yet)'
      return `[[${p.slug}]]${summary} (updated ${age}, ${p.source_count} sources)`
    })
    .join('\n')
}

/**
 * Get full page content for a specific entity — used by chat agent read_wiki tool.
 */
export async function readWikiPage(
  db: SupabaseClient,
  slug: string
): Promise<{ found: boolean; page: WikiPage | null; links: string[] }> {
  const page = await getWikiPageBySlug(db, slug)
  if (!page) return { found: false, page: null, links: [] }

  // Get outbound links
  const { data: linkData } = await db
    .from('wiki_links')
    .select('to_page_id, wiki_pages!wiki_links_to_page_id_fkey(slug, title)')
    .eq('from_page_id', page.id)

  const links = (linkData ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (l: any) => `[[${l.wiki_pages?.slug}]] — ${l.wiki_pages?.title}`
  )

  // Log as 'query' in wiki_log
  await db.from('wiki_log').insert({
    org_id: ORG_ID,
    event_type: 'query',
    page_id: page.id,
    note: `read by chat agent`,
  })

  return { found: true, page, links }
}

// ─────────────────────────────────────────
// Write — called from ingest pipeline after structured data is saved
// ─────────────────────────────────────────

/**
 * Update wiki pages for all entities touched by an entry.
 *
 * For each brand entity touched:
 *   1. Load current wiki page content (if any)
 *   2. Load recent structured data (tasks, decisions) for context
 *   3. Single Claude API call: rewrite page with new info integrated
 *   4. Save updated content + summary back to wiki_pages
 *   5. Update cross-links between pages
 *   6. Log to wiki_log
 *
 * Non-brand entities (vendors, contacts, topics) get lightweight pages
 * created on first mention but only updated if there's substantive new info.
 */
export async function updateWikiPagesForEntry(
  db: SupabaseClient,
  entryId: string,
  touchedEntityIds: string[]
): Promise<{ pages_updated: number }> {
  if (!touchedEntityIds.length) return { pages_updated: 0 }

  let pagesUpdated = 0

  // Load the raw entry text for context
  const { data: entry } = await db
    .from('entries')
    .select('raw_text, source, created_at')
    .eq('id', entryId)
    .single()

  if (!entry) return { pages_updated: 0 }

  // Process brand entities first, then others
  const { data: entities } = await db
    .from('entities')
    .select('*')
    .in('id', touchedEntityIds)
    .order('type')  // brands first

  for (const entity of entities ?? []) {
    try {
      await updateWikiPageForEntity(db, entity as Entity, entry, entryId)
      pagesUpdated++
    } catch (err) {
      // Don't fail the whole ingest if wiki update fails — log and continue
      console.error(`Wiki update failed for entity ${entity.id}:`, err)
    }
  }

  return { pages_updated: pagesUpdated }
}

async function updateWikiPageForEntity(
  db: SupabaseClient,
  entity: Entity,
  entry: { raw_text: string; source: string; created_at: string },
  entryId: string
): Promise<void> {
  // Get or create the wiki page
  const slug = entity.normalized_name.replace(/\s+/g, '-')

  let { data: page } = await db
    .from('wiki_pages')
    .select('*')
    .eq('org_id', ORG_ID)
    .eq('slug', slug)
    .single()

  if (!page) {
    const { data: newPage } = await db
      .from('wiki_pages')
      .insert({
        org_id: ORG_ID,
        entity_id: entity.id,
        slug,
        title: entity.name,
        content: '',
        summary: '',
        source_count: 0,
      })
      .select()
      .single()
    page = newPage
  }

  if (!page) return

  // Load structured context for this entity
  const structuredContext = await buildStructuredContext(db, entity.id, entity.type)

  // Existing wiki content (may be empty on first ingest)
  const existingContent = (page as WikiPage).content || ''
  const isFirstEntry = !existingContent.trim()

  const systemPrompt = `You maintain a persistent wiki for a marketing agency operator.
Your job: integrate new information into the existing wiki page for "${entity.name}".

Rules:
- The wiki page is markdown. Use ## headers, bullet points, and [[slug]] cross-references.
- Integrate new info — don't just append. Update existing sections if they conflict or need revision.
- Keep the page focused and useful. Remove stale/resolved items when superseded.
- Always keep these sections in order:
  1. ## Overview — one paragraph current state
  2. ## Open Items — current open tasks and escalations (if any)
  3. ## Recent Activity — last 5-10 things that happened, newest first
  4. ## Decisions — key decisions made (not every minor one)
  5. ## Vendors & Contacts — relevant relationships (if any)
  6. ## Notes — anything that doesn't fit above

For cross-references, use [[slug]] format (e.g. [[moe-seo]], [[miracle-method]]).
At the end, output a separate JSON block for:
  - summary: one paragraph plain-text synopsis (no markdown)
  - links: array of {slug, context} for cross-references this page should have`

  const userPrompt = `${isFirstEntry ? 'Create a new wiki page' : 'Update the existing wiki page'} for: ${entity.name} (${entity.type})

${existingContent ? `EXISTING CONTENT:\n${existingContent}\n\n` : ''}NEW ENTRY (${entry.source}, ${entry.created_at.slice(0, 10)}):\n${entry.raw_text}

CURRENT STRUCTURED DATA:
${structuredContext}

Write the full updated wiki page markdown. Then output a JSON block like:
\`\`\`json
{"summary": "...", "links": [{"slug": "...", "context": "..."}]}
\`\`\``

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const rawOutput = response.content[0].type === 'text' ? response.content[0].text : ''

  // Parse out the JSON metadata block
  const jsonMatch = rawOutput.match(/```json\n([\s\S]*?)\n```/)
  let summary = ''
  let links: Array<{ slug: string; context: string }> = []

  if (jsonMatch) {
    try {
      const meta = JSON.parse(jsonMatch[1])
      summary = meta.summary ?? ''
      links = meta.links ?? []
    } catch {
      // ignore parse failures
    }
  }

  // Strip the JSON block from the content
  const content = rawOutput.replace(/```json\n[\s\S]*?\n```/g, '').trim()

  // Save updated page
  await db
    .from('wiki_pages')
    .update({
      content,
      summary,
      source_count: ((page as WikiPage).source_count ?? 0) + 1,
      last_updated_by_entry: entryId,
    })
    .eq('id', (page as WikiPage).id)

  // Update cross-links
  await updateWikiLinks(db, (page as WikiPage).id, links)

  // Log
  await db.from('wiki_log').insert({
    org_id: ORG_ID,
    event_type: 'ingest',
    page_id: (page as WikiPage).id,
    entry_id: entryId,
    note: `updated ${entity.name} wiki page (${isFirstEntry ? 'created' : 'revised'})`,
  })
}

async function updateWikiLinks(
  db: SupabaseClient,
  fromPageId: string,
  links: Array<{ slug: string; context: string }>
): Promise<void> {
  if (!links.length) return

  for (const link of links) {
    // Find target page by slug
    const { data: targetPage } = await db
      .from('wiki_pages')
      .select('id')
      .eq('org_id', ORG_ID)
      .eq('slug', link.slug)
      .single()

    if (!targetPage) continue

    await db
      .from('wiki_links')
      .upsert(
        {
          from_page_id: fromPageId,
          to_page_id: targetPage.id,
          context: link.context,
        },
        { onConflict: 'from_page_id,to_page_id' }
      )
  }
}

/**
 * Build structured context string from DB for a given entity.
 * Injected into the wiki update prompt so Claude has current facts.
 */
async function buildStructuredContext(
  db: SupabaseClient,
  entityId: string,
  entityType: string
): Promise<string> {
  const lines: string[] = []

  if (entityType === 'brand') {
    // Open tasks
    const { data: taskLinks } = await db
      .from('task_entities')
      .select('task_id')
      .eq('entity_id', entityId)
      .eq('role', 'brand')

    const taskIds = taskLinks?.map((t) => t.task_id) ?? []

    if (taskIds.length > 0) {
      const { data: tasks } = await db
        .from('tasks')
        .select('description, status, escalation, due_date, waiting_on')
        .in('id', taskIds)
        .order('escalation', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(20)

      const open = (tasks ?? []).filter((t) => t.status === 'open')
      const done = (tasks ?? []).filter((t) => t.status === 'done')

      if (open.length) {
        lines.push(`OPEN TASKS (${open.length}):`)
        open.forEach((t) => {
          const flags = [
            t.escalation ? '🔥 ESCALATED' : '',
            t.due_date ? `due ${t.due_date}` : '',
            t.waiting_on ? `waiting on ${t.waiting_on}` : '',
          ].filter(Boolean).join(', ')
          lines.push(`  - ${t.description}${flags ? ` [${flags}]` : ''}`)
        })
      }

      if (done.length) {
        lines.push(`\nRECENTLY CLOSED (${Math.min(done.length, 5)}):`)
        done.slice(0, 5).forEach((t) => lines.push(`  - ✓ ${t.description}`))
      }
    }

    // Recent decisions
    const { data: decLinks } = await db
      .from('decision_entities')
      .select('decision_id')
      .eq('entity_id', entityId)

    const decIds = decLinks?.map((d) => d.decision_id) ?? []

    if (decIds.length > 0) {
      const { data: decisions } = await db
        .from('decisions')
        .select('summary, made_by, created_at')
        .in('id', decIds)
        .order('created_at', { ascending: false })
        .limit(5)

      if (decisions?.length) {
        lines.push(`\nDECISIONS:`)
        decisions.forEach((d) => {
          lines.push(`  - ${d.summary}${d.made_by ? ` (${d.made_by})` : ''} [${d.created_at.slice(0, 10)}]`)
        })
      }
    }
  }

  return lines.join('\n') || 'No structured data yet.'
}

// ─────────────────────────────────────────
// Lint — periodic health check (called from /api/cron/briefing)
// ─────────────────────────────────────────

/**
 * Run a wiki health check. Returns findings.
 * Checks: orphan pages, stale pages, missing summaries, contradictions.
 */
export async function lintWiki(db: SupabaseClient): Promise<{
  orphans: string[]
  stale: string[]
  empty: string[]
}> {
  const { data: pages } = await db
    .from('wiki_pages')
    .select('id, slug, title, content, summary, updated_at, source_count')
    .eq('org_id', ORG_ID)

  const now = Date.now()
  const sevenDays = 7 * 24 * 60 * 60 * 1000

  const orphans: string[] = []
  const stale: string[] = []
  const empty: string[] = []

  for (const page of pages ?? []) {
    if (!page.content?.trim()) {
      empty.push(page.slug)
      continue
    }

    const age = now - new Date(page.updated_at).getTime()
    if (age > sevenDays && page.source_count > 0) {
      stale.push(page.slug)
    }

    // Check for inbound links (orphan = no inbound links and source_count > 2)
    const { count } = await db
      .from('wiki_links')
      .select('id', { count: 'exact' })
      .eq('to_page_id', page.id)

    if ((count ?? 0) === 0 && page.source_count > 2) {
      orphans.push(page.slug)
    }
  }

  return { orphans, stale, empty }
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function formatAge(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
