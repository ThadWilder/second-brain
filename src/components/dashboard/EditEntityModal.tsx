'use client'

import { useState, useEffect } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import type { Entity } from '@/types'

interface Relationship {
  id: string
  relationship: string
  entity: { id: string; name: string; type: string }
  direction: 'outbound' | 'inbound'
}

interface Props {
  entity: Entity
  allEntities: Entity[]  // all entities across all types (for relationship picker)
  onClose: () => void
  onSaved: () => void
}

const CATEGORY_OPTIONS = [
  { value: 'team', label: 'Team member' },
  { value: 'client_contact', label: 'Client contact' },
  { value: 'freelancer', label: 'Freelancer' },
  { value: 'external', label: 'External' },
]

const RELATIONSHIP_TYPES = [
  { value: 'works_for', label: 'works for' },
  { value: 'manages', label: 'manages' },
  { value: 'rep_for', label: 'rep for' },
  { value: 'contracted_by', label: 'contracted by' },
  { value: 'supplies', label: 'supplies' },
  { value: 'works_with', label: 'works with' },
]

export function EditEntityModal({ entity, allEntities, onClose, onSaved }: Props) {
  const meta = (entity.metadata ?? {}) as Record<string, string>

  const [name, setName] = useState(entity.name)
  const [category, setCategory] = useState(meta.category ?? '')
  const [role, setRole] = useState(meta.role ?? '')
  const [company, setCompany] = useState(meta.company ?? '')
  const [notes, setNotes] = useState(meta.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Relationships
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [loadingRels, setLoadingRels] = useState(true)
  const [newRelTarget, setNewRelTarget] = useState('')
  const [newRelType, setNewRelType] = useState('works_for')
  const [addingRel, setAddingRel] = useState(false)

  // Exclude self from relationship targets
  const relTargets = allEntities.filter((e) => e.id !== entity.id)

  // Load existing relationships
  useEffect(() => {
    loadRelationships()
  }, [entity.id])

  async function loadRelationships() {
    setLoadingRels(true)
    try {
      const res = await fetch(`/api/entities/link?entity_id=${entity.id}`)
      const data = await res.json()

      const rels: Relationship[] = []

      for (const r of data.outbound ?? []) {
        const target = r.entities ?? r
        rels.push({
          id: r.id,
          relationship: r.relationship,
          entity: { id: target.id, name: target.name, type: target.type },
          direction: 'outbound',
        })
      }

      for (const r of data.inbound ?? []) {
        const source = r.entities ?? r
        rels.push({
          id: r.id,
          relationship: r.relationship,
          entity: { id: source.id, name: source.name, type: source.type },
          direction: 'inbound',
        })
      }

      setRelationships(rels)
    } catch {
      // ignore load errors
    } finally {
      setLoadingRels(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)

    try {
      const metadata: Record<string, string> = {}
      if (category) metadata.category = category
      if (role) metadata.role = role
      if (company) metadata.company = company
      if (notes) metadata.notes = notes

      const res = await fetch('/api/entities/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_id: entity.id,
          name: name !== entity.name ? name : undefined,
          metadata,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Save failed')
        return
      }

      onSaved()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function addRelationship() {
    if (!newRelTarget || !newRelType) return
    setAddingRel(true)

    try {
      await fetch('/api/entities/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_entity_id: entity.id,
          to_entity_id: newRelTarget,
          relationship: newRelType,
        }),
      })
      setNewRelTarget('')
      await loadRelationships()
    } finally {
      setAddingRel(false)
    }
  }

  async function removeRelationship(relId: string) {
    await fetch('/api/entities/link', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: relId }),
    })
    setRelationships((prev) => prev.filter((r) => r.id !== relId))
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const isContact = entity.type === 'contact'
  const isVendor = entity.type === 'vendor'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[var(--text)]">
            Edit {entity.name}
          </h3>
          <button
            onClick={onClose}
            className="text-[var(--muted)] hover:text-[var(--text)] transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Name */}
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
          />
        </Field>

        {/* Category (contacts only) */}
        {isContact && (
          <Field label="Category">
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setCategory(opt.value)}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                    category === opt.value
                      ? 'border-[var(--accent)] bg-amber-50 text-[var(--accent)]'
                      : 'border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>
        )}

        {/* Role */}
        {(isContact || isVendor) && (
          <Field label="Role / Title">
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder={isContact ? 'e.g. Account manager' : 'e.g. SEO specialist'}
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
            />
          </Field>
        )}

        {/* Company */}
        {isContact && (
          <Field label="Company">
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Miracle Method"
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
            />
          </Field>
        )}

        {/* Notes */}
        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Anything worth remembering..."
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] resize-none"
          />
        </Field>

        {/* ── Relationships ──────────────────────────────────────────── */}
        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-3">
            Linked To
          </h4>

          {/* Existing relationships */}
          {loadingRels ? (
            <p className="text-xs text-[var(--muted)]">Loading...</p>
          ) : relationships.length === 0 ? (
            <p className="text-xs text-[var(--muted)] mb-3">No links yet.</p>
          ) : (
            <div className="space-y-1.5 mb-3">
              {relationships.map((rel) => (
                <div
                  key={rel.id}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-xs"
                >
                  <span className="text-[var(--muted)]">
                    {rel.direction === 'outbound'
                      ? `${entity.name}`
                      : `${rel.entity.name}`}
                  </span>
                  <span className="text-[var(--accent)] font-medium">
                    {RELATIONSHIP_TYPES.find((t) => t.value === rel.relationship)?.label ?? rel.relationship}
                  </span>
                  <span className="text-[var(--text)]">
                    {rel.direction === 'outbound' ? rel.entity.name : entity.name}
                  </span>
                  <span className="text-[10px] text-[var(--muted)]">
                    ({rel.entity.type})
                  </span>
                  <button
                    onClick={() => removeRelationship(rel.id)}
                    className="ml-auto text-[var(--muted)] hover:text-[var(--danger)] transition-colors"
                    title="Remove link"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add new relationship */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-[var(--muted)] mb-1 block">Link to</label>
              <select
                value={newRelTarget}
                onChange={(e) => setNewRelTarget(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)] appearance-none"
              >
                <option value="">Select entity...</option>
                {['brand', 'vendor', 'contact', 'topic'].map((type) => {
                  const group = relTargets.filter((e) => e.type === type)
                  if (!group.length) return null
                  return (
                    <optgroup key={type} label={type.charAt(0).toUpperCase() + type.slice(1) + 's'}>
                      {group.map((e) => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                      ))}
                    </optgroup>
                  )
                })}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-[var(--muted)] mb-1 block">Relationship</label>
              <select
                value={newRelType}
                onChange={(e) => setNewRelType(e.target.value)}
                className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)] appearance-none"
              >
                {RELATIONSHIP_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={addRelationship}
              disabled={!newRelTarget || addingRel}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors shrink-0"
            >
              {addingRel ? '...' : <><Plus className="w-3.5 h-3.5 inline" /> Link</>}
            </button>
          </div>
        </div>

        {/* ── Actions ────────────────────────────────────────────────── */}
        {error && <p className="text-xs text-[var(--danger)] mt-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-xs rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-xs text-[var(--muted)] mb-1">{label}</label>
      {children}
    </div>
  )
}
