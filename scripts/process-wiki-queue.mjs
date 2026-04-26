#!/usr/bin/env node

/**
 * Local wiki queue processor — runs outside Next.js, no timeout limits.
 * Processes wiki queue items in parallel batches.
 *
 * Usage: node scripts/process-wiki-queue.mjs [--batch 5] [--limit 500]
 */

import { readFileSync } from 'fs'
// Load .env.local manually
for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match) process.env[match[1].trim()] = match[2].trim()
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const ORG_ID = process.env.ORG_ID ?? '00000000-0000-0000-0000-000000000001'
const MODEL = 'claude-haiku-4-5-20251001'

const BATCH_SIZE = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--batch') ?? '5')
const LIMIT = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--limit') ?? '500')

const headers = {
  apikey: ANON_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

async function supabase(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { ...headers, Prefer: method === 'GET' ? '' : 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`Supabase ${method} ${path}: ${res.status}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

async function callClaude(system, user) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Claude ${res.status}: ${err.slice(0, 200)}`)
  }
  const data = await res.json()
  return data.content[0]?.text ?? ''
}

async function processItem(item) {
  // Fetch entity
  const [entity] = await supabase('GET', `entities?id=eq.${item.entity_id}&select=*`)
  if (!entity) { await markDone(item.id, 'failed'); return 'skip-no-entity' }

  // Fetch entry (if exists)
  let entry = null
  if (item.entry_id) {
    const entries = await supabase('GET', `entries?id=eq.${item.entry_id}&select=id,raw_text,source,created_at`)
    entry = entries?.[0]
  }
  if (!entry) {
    entry = { id: 'synthetic', raw_text: '(Wiki refresh triggered by task update)', source: 'system', created_at: new Date().toISOString() }
  }

  // Fetch existing wiki page
  const slug = entity.normalized_name.replace(/\s+/g, '-')
  const existing = await supabase('GET', `wiki_pages?slug=eq.${encodeURIComponent(slug)}&select=id,content,source_count`)
  const page = existing?.[0]
  const existingContent = page?.content ?? ''
  const pinnedSections = []

  // Build context
  const tasks = await supabase('GET', `task_entities?entity_id=eq.${item.entity_id}&select=tasks(description,status,due_date,waiting_on)&limit=20`)
  const taskList = (tasks ?? []).map(t => t.tasks).filter(Boolean).map(t => `- [${t.status}] ${t.description}`).join('\n')

  const system = `You synthesize wiki pages for a marketing agency. Write clear, structured markdown.
Sections: ## Overview, ## Current Status, ## Open Tasks, ## Decisions, ## Notes
Use [[slug]] for cross-references. At the end output a JSON block:
\`\`\`json
{"summary": "one paragraph synopsis", "links": [{"slug": "...", "context": "..."}]}
\`\`\``

  const user = `${existingContent ? 'Update' : 'Create'} wiki page for: ${entity.name} (${entity.type})
${existingContent ? `\nEXISTING:\n${existingContent}\n` : ''}
NEW ENTRY (${entry.source}, ${entry.created_at.slice(0, 10)}):
${entry.raw_text.slice(0, 3000)}
${taskList ? `\nOPEN TASKS:\n${taskList}` : ''}`

  const raw = await callClaude(system, user)

  // Parse JSON metadata
  const fenced = raw.match(/```json\s*\n([\s\S]*?)\n\s*```/)
  const unfenced = !fenced && raw.match(/\n(\{"summary"[\s\S]*\})\s*$/)
  const jsonMatch = fenced || unfenced
  let summary = ''
  let links = []
  if (jsonMatch) {
    try { const m = JSON.parse(jsonMatch[1]); summary = m.summary ?? ''; links = m.links ?? [] } catch {}
  }

  let content = raw.replace(/```json\s*\n[\s\S]*?\n\s*```/g, '').replace(/\n\{"summary"[\s\S]*\}\s*$/, '').trim()

  // Prepend pinned sections
  if (pinnedSections.length) {
    const pinned = pinnedSections.map(s => `## 📌 ${s.title}\n\n${s.content}`).join('\n\n')
    content = `${pinned}\n\n---\n\n${content}`
  }

  // Upsert wiki page
  if (page) {
    await supabase('PATCH', `wiki_pages?id=eq.${page.id}`, {
      content, summary, source_count: (page.source_count ?? 0) + 1, updated_at: new Date().toISOString(),
    })
  } else {
    await supabase('POST', 'wiki_pages', {
      org_id: ORG_ID, entity_id: item.entity_id, slug, title: entity.name,
      content, summary, source_count: 1,
    })
  }

  // Upsert links
  for (const link of links) {
    try {
      const targetPage = await supabase('GET', `wiki_pages?slug=eq.${encodeURIComponent(link.slug)}&select=id`)
      if (targetPage?.[0]) {
        const fromPage = page?.id ?? (await supabase('GET', `wiki_pages?slug=eq.${encodeURIComponent(slug)}&select=id`))?.[0]?.id
        if (fromPage) {
          await supabase('POST', 'wiki_links', {
            from_page_id: fromPage, to_page_id: targetPage[0].id, context: link.context,
          }).catch(() => {}) // ignore dupes
        }
      }
    } catch {}
  }

  return 'ok'
}

async function markDone(id, status = 'done') {
  await supabase('PATCH', `wiki_queue?id=eq.${id}`, { status })
}

async function main() {
  console.log(`Wiki queue processor — batch=${BATCH_SIZE}, limit=${LIMIT}`)
  let total = 0

  while (total < LIMIT) {
    const items = await supabase('GET', `wiki_queue?status=eq.pending&org_id=eq.${ORG_ID}&order=created_at.asc&limit=${BATCH_SIZE}`)
    if (!items?.length) { console.log('Queue empty!'); break }

    // Mark as processing
    await supabase('PATCH', `wiki_queue?id=in.(${items.map(i => i.id).join(',')})`, { status: 'processing' })

    // Process in parallel
    const results = await Promise.allSettled(items.map(async (item) => {
      try {
        const result = await processItem(item)
        await markDone(item.id)
        return result
      } catch (err) {
        console.error(`  ✗ ${item.entity_id}: ${err.message.slice(0, 100)}`)
        await markDone(item.id, 'failed')
        return 'error'
      }
    }))

    const ok = results.filter(r => r.status === 'fulfilled' && r.value === 'ok').length
    total += ok
    const entityNames = items.map(i => i.entity_id.slice(0, 8)).join(', ')
    console.log(`[${total}] Batch: ${ok}/${items.length} ok (${entityNames})`)
  }

  console.log(`\nDone: ${total} pages processed`)
}

main().catch(err => { console.error(err); process.exit(1) })
