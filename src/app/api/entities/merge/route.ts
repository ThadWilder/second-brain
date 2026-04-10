export const dynamic = 'force-dynamic'

/**
 * POST /api/entities/merge
 *
 * Merge a duplicate entity into a canonical one.
 * - Rewires all foreign keys (entry_entities, task_entities, decision_entities,
 *   pending_response_entities, wiki_pages) from duplicate → canonical
 * - Registers duplicate's name + all its aliases as aliases on the canonical
 * - Merges metadata (canonical wins on conflicts)
 * - Deletes the duplicate entity
 *
 * Body: { canonical_id, duplicate_id }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { normalize } from '@/lib/entities'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { canonical_id, duplicate_id } = await req.json()

  if (!canonical_id || !duplicate_id) {
    return NextResponse.json({ error: 'Missing canonical_id or duplicate_id' }, { status: 400 })
  }

  if (canonical_id === duplicate_id) {
    return NextResponse.json({ error: 'Cannot merge entity into itself' }, { status: 400 })
  }

  const db = getServiceClient()

  // Load both entities
  const { data: canonical } = await db.from('entities').select('*').eq('id', canonical_id).single()
  const { data: duplicate } = await db.from('entities').select('*').eq('id', duplicate_id).single()

  if (!canonical || !duplicate) {
    return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
  }

  // ── 1. Rewire entry_entities ─────────────────────────────────────────
  // Get existing canonical links to avoid unique constraint violations
  const { data: existingEntryLinks } = await db
    .from('entry_entities')
    .select('entry_id, relationship')
    .eq('entity_id', canonical_id)

  const existingEntryKeys = new Set(
    (existingEntryLinks ?? []).map((l) => `${l.entry_id}::${l.relationship}`)
  )

  // Update non-conflicting links
  const { data: dupeEntryLinks } = await db
    .from('entry_entities')
    .select('id, entry_id, relationship')
    .eq('entity_id', duplicate_id)

  for (const link of dupeEntryLinks ?? []) {
    const key = `${link.entry_id}::${link.relationship}`
    if (existingEntryKeys.has(key)) {
      // Conflict — just delete the duplicate link
      await db.from('entry_entities').delete().eq('id', link.id)
    } else {
      await db.from('entry_entities').update({ entity_id: canonical_id }).eq('id', link.id)
    }
  }

  // ── 2. Rewire task_entities ──────────────────────────────────────────
  const { data: existingTaskLinks } = await db
    .from('task_entities')
    .select('task_id, role')
    .eq('entity_id', canonical_id)

  const existingTaskKeys = new Set(
    (existingTaskLinks ?? []).map((l) => `${l.task_id}::${l.role}`)
  )

  const { data: dupeTaskLinks } = await db
    .from('task_entities')
    .select('id, task_id, role')
    .eq('entity_id', duplicate_id)

  for (const link of dupeTaskLinks ?? []) {
    const key = `${link.task_id}::${link.role}`
    if (existingTaskKeys.has(key)) {
      await db.from('task_entities').delete().eq('id', link.id)
    } else {
      await db.from('task_entities').update({ entity_id: canonical_id }).eq('id', link.id)
    }
  }

  // ── 3. Rewire decision_entities ──────────────────────────────────────
  const { data: existingDecLinks } = await db
    .from('decision_entities')
    .select('decision_id, role')
    .eq('entity_id', canonical_id)

  const existingDecKeys = new Set(
    (existingDecLinks ?? []).map((l) => `${l.decision_id}::${l.role}`)
  )

  const { data: dupeDecLinks } = await db
    .from('decision_entities')
    .select('id, decision_id, role')
    .eq('entity_id', duplicate_id)

  for (const link of dupeDecLinks ?? []) {
    const key = `${link.decision_id}::${link.role}`
    if (existingDecKeys.has(key)) {
      await db.from('decision_entities').delete().eq('id', link.id)
    } else {
      await db.from('decision_entities').update({ entity_id: canonical_id }).eq('id', link.id)
    }
  }

  // ── 4. Rewire pending_response_entities ──────────────────────────────
  const { data: existingPRLinks } = await db
    .from('pending_response_entities')
    .select('pending_response_id, role')
    .eq('entity_id', canonical_id)

  const existingPRKeys = new Set(
    (existingPRLinks ?? []).map((l) => `${l.pending_response_id}::${l.role}`)
  )

  const { data: dupePRLinks } = await db
    .from('pending_response_entities')
    .select('id, pending_response_id, role')
    .eq('entity_id', duplicate_id)

  for (const link of dupePRLinks ?? []) {
    const key = `${link.pending_response_id}::${link.role}`
    if (existingPRKeys.has(key)) {
      await db.from('pending_response_entities').delete().eq('id', link.id)
    } else {
      await db.from('pending_response_entities').update({ entity_id: canonical_id }).eq('id', link.id)
    }
  }

  // ── 5. Rewire tasks.waiting_on_entity_id ─────────────────────────────
  await db
    .from('tasks')
    .update({ waiting_on_entity_id: canonical_id })
    .eq('waiting_on_entity_id', duplicate_id)

  // ── 6. Rewire wiki_pages ─────────────────────────────────────────────
  // If duplicate has a wiki page, merge content into canonical's page or reassign
  const { data: dupeWiki } = await db
    .from('wiki_pages')
    .select('id, content')
    .eq('entity_id', duplicate_id)
    .single()

  if (dupeWiki) {
    const { data: canonWiki } = await db
      .from('wiki_pages')
      .select('id, content')
      .eq('entity_id', canonical_id)
      .single()

    if (canonWiki) {
      // Append duplicate's content to canonical's wiki if it has any
      if (dupeWiki.content?.trim()) {
        const merged = canonWiki.content
          ? `${canonWiki.content}\n\n---\n_Merged from ${duplicate.name}:_\n\n${dupeWiki.content}`
          : dupeWiki.content
        await db.from('wiki_pages').update({ content: merged }).eq('id', canonWiki.id)
      }
      // Delete duplicate's wiki page
      await db.from('wiki_pages').delete().eq('id', dupeWiki.id)
    } else {
      // No canonical wiki — just reassign
      await db.from('wiki_pages').update({ entity_id: canonical_id }).eq('id', dupeWiki.id)
    }
  }

  // ── 7. Rewire entity_relationships ───────────────────────────────────
  // Rewire from_entity_id
  const { data: existingOutRels } = await db
    .from('entity_relationships')
    .select('to_entity_id, relationship')
    .eq('from_entity_id', canonical_id)

  const existingOutRelKeys = new Set(
    (existingOutRels ?? []).map((r) => `${r.to_entity_id}::${r.relationship}`)
  )

  const { data: dupeOutRels } = await db
    .from('entity_relationships')
    .select('id, to_entity_id, relationship')
    .eq('from_entity_id', duplicate_id)

  for (const rel of dupeOutRels ?? []) {
    const key = `${rel.to_entity_id}::${rel.relationship}`
    if (existingOutRelKeys.has(key)) {
      await db.from('entity_relationships').delete().eq('id', rel.id)
    } else {
      await db.from('entity_relationships').update({ from_entity_id: canonical_id }).eq('id', rel.id)
    }
  }

  // Rewire to_entity_id
  const { data: existingInRels } = await db
    .from('entity_relationships')
    .select('from_entity_id, relationship')
    .eq('to_entity_id', canonical_id)

  const existingInRelKeys = new Set(
    (existingInRels ?? []).map((r) => `${r.from_entity_id}::${r.relationship}`)
  )

  const { data: dupeInRels } = await db
    .from('entity_relationships')
    .select('id, from_entity_id, relationship')
    .eq('to_entity_id', duplicate_id)

  for (const rel of dupeInRels ?? []) {
    const key = `${rel.from_entity_id}::${rel.relationship}`
    if (existingInRelKeys.has(key)) {
      await db.from('entity_relationships').delete().eq('id', rel.id)
    } else {
      await db.from('entity_relationships').update({ to_entity_id: canonical_id }).eq('id', rel.id)
    }
  }

  // ── 8. Rewire pending_clarifications ─────────────────────────────────
  await db
    .from('pending_clarifications')
    .update({ entity_id: canonical_id })
    .eq('entity_id', duplicate_id)

  // ── 9. Register aliases ──────────────────────────────────────────────
  // Add duplicate's name as alias on canonical
  const dupeNormalized = normalize(duplicate.name)
  if (dupeNormalized !== (canonical as { normalized_name: string }).normalized_name) {
    await db
      .from('entity_aliases')
      .upsert(
        { entity_id: canonical_id, alias: duplicate.name, normalized_alias: dupeNormalized },
        { onConflict: 'normalized_alias,entity_id', ignoreDuplicates: true }
      )
  }

  // Move all of duplicate's aliases to canonical
  const { data: dupeAliases } = await db
    .from('entity_aliases')
    .select('id, alias, normalized_alias')
    .eq('entity_id', duplicate_id)

  for (const alias of dupeAliases ?? []) {
    // Check if canonical already has this alias
    const { data: existing } = await db
      .from('entity_aliases')
      .select('id')
      .eq('entity_id', canonical_id)
      .eq('normalized_alias', alias.normalized_alias)
      .single()

    if (!existing) {
      await db
        .from('entity_aliases')
        .update({ entity_id: canonical_id })
        .eq('id', alias.id)
    } else {
      await db.from('entity_aliases').delete().eq('id', alias.id)
    }
  }

  // ── 10. Merge metadata ──────────────────────────────────────────────
  const canonMeta = (canonical.metadata as Record<string, unknown>) ?? {}
  const dupeMeta = (duplicate.metadata as Record<string, unknown>) ?? {}
  // Duplicate fills gaps, canonical wins on conflicts
  const mergedMeta = { ...dupeMeta, ...canonMeta }

  // Use the earlier first_seen
  const canonFirst = new Date(canonical.first_seen).getTime()
  const dupeFirst = new Date(duplicate.first_seen).getTime()

  await db.from('entities').update({
    metadata: mergedMeta,
    first_seen: dupeFirst < canonFirst ? duplicate.first_seen : canonical.first_seen,
  }).eq('id', canonical_id)

  // ── 11. Delete duplicate entity ──────────────────────────────────────
  await db.from('entities').delete().eq('id', duplicate_id)

  return NextResponse.json({
    success: true,
    canonical_id,
    deleted_id: duplicate_id,
    aliases_added: 1 + (dupeAliases?.length ?? 0),
  })
}
