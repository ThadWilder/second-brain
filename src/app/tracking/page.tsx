'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  Eye,
  Pin,
  Pencil,
  Check,
  Pause,
  Play,
  Trash2,
  X,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Clock,
  Link2,
  BarChart3,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/browser'
import { useToast } from '@/components/ui/Toast'

interface BrandEntity {
  id: string
  name: string
}

interface TrackedItem {
  id: string
  org_id: string
  title: string
  description: string | null
  status: 'active' | 'completed' | 'paused'
  owner: string | null
  brand_entity_id: string | null
  follow_up_date: string | null
  data_source: string | null
  data_source_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
  entities: BrandEntity | null
}

function formatDateET(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date()
  const d = new Date(dateStr)
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHrs = Math.floor(diffMins / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  const diffDays = Math.floor(diffHrs / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDateET(dateStr)
}

function getDueDateStatus(date: string | null): 'overdue' | 'due-soon' | 'on-track' | null {
  if (!date) return null
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const followUp = new Date(date + 'T00:00:00')
  const diffDays = Math.floor((followUp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'overdue'
  if (diffDays <= 3) return 'due-soon'
  return 'on-track'
}

const BORDER_COLORS = {
  overdue: 'border-l-red-500',
  'due-soon': 'border-l-amber-500',
  'on-track': 'border-l-green-500',
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-50 text-green-700 border-green-200',
  paused: 'bg-amber-50 text-amber-700 border-amber-200',
  completed: 'bg-blue-50 text-blue-700 border-blue-200',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-xs text-[var(--muted)] mb-1">{label}</label>
      {children}
    </div>
  )
}

export default function TrackingPage() {
  const [items, setItems] = useState<TrackedItem[]>([])
  const [brands, setBrands] = useState<BrandEntity[]>([])
  const [loading, setLoading] = useState(true)
  const [showPinNew, setShowPinNew] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set())
  const [completedExpanded, setCompletedExpanded] = useState(false)
  const [pausedExpanded, setPausedExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

  // Pin New form state
  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formOwner, setFormOwner] = useState('')
  const [formBrandId, setFormBrandId] = useState('')
  const [formFollowUp, setFormFollowUp] = useState('')
  const [formDataSource, setFormDataSource] = useState('')
  const [formDataSourceUrl, setFormDataSourceUrl] = useState('')
  const [formNotes, setFormNotes] = useState('')

  // Edit form state
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editOwner, setEditOwner] = useState('')
  const [editBrandId, setEditBrandId] = useState('')
  const [editFollowUp, setEditFollowUp] = useState('')
  const [editDataSource, setEditDataSource] = useState('')
  const [editDataSourceUrl, setEditDataSourceUrl] = useState('')
  const [editNotes, setEditNotes] = useState('')

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/tracking')
      if (!res.ok) return
      const data = await res.json()
      setItems(data.items)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchBrands = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard')
      if (!res.ok) return
      const data = await res.json()
      const brandEntities = (data.entities ?? [])
        .filter((e: { type: string; archived?: boolean }) => e.type === 'brand' && !e.archived)
        .map((e: { id: string; name: string }) => ({ id: e.id, name: e.name }))
        .sort((a: BrandEntity, b: BrandEntity) => a.name.localeCompare(b.name))
      setBrands(brandEntities)
    } catch {
      // Brands list is optional
    }
  }, [])

  useEffect(() => {
    fetchItems()
    fetchBrands()
  }, [fetchItems, fetchBrands])

  const resetForm = () => {
    setFormTitle('')
    setFormDescription('')
    setFormOwner('')
    setFormBrandId('')
    setFormFollowUp('')
    setFormDataSource('')
    setFormDataSourceUrl('')
    setFormNotes('')
  }

  const handlePinNew = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formTitle.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formTitle,
          description: formDescription,
          owner: formOwner,
          brand_entity_id: formBrandId || null,
          follow_up_date: formFollowUp || null,
          data_source: formDataSource,
          data_source_url: formDataSourceUrl,
          notes: formNotes,
        }),
      })
      if (res.ok) {
        showToast({ type: 'success', message: 'Item pinned' })
        setShowPinNew(false)
        resetForm()
        fetchItems()
      } else {
        showToast({ type: 'error', message: 'Failed to pin item' })
      }
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (id: string, updates: Record<string, unknown>) => {
    const res = await fetch(`/api/tracking/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (res.ok) {
      fetchItems()
      return true
    }
    showToast({ type: 'error', message: 'Failed to update' })
    return false
  }

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"?`)) return
    const res = await fetch(`/api/tracking/${id}`, { method: 'DELETE' })
    if (res.ok) {
      showToast({ type: 'success', message: 'Item deleted' })
      fetchItems()
    } else {
      showToast({ type: 'error', message: 'Failed to delete' })
    }
  }

  const startEdit = (item: TrackedItem) => {
    setEditingId(item.id)
    setEditTitle(item.title)
    setEditDescription(item.description ?? '')
    setEditOwner(item.owner ?? '')
    setEditBrandId(item.brand_entity_id ?? '')
    setEditFollowUp(item.follow_up_date ?? '')
    setEditDataSource(item.data_source ?? '')
    setEditDataSourceUrl(item.data_source_url ?? '')
    setEditNotes(item.notes ?? '')
  }

  const handleSaveEdit = async (id: string) => {
    setSaving(true)
    try {
      const ok = await handleUpdate(id, {
        title: editTitle,
        description: editDescription,
        owner: editOwner,
        brand_entity_id: editBrandId || null,
        follow_up_date: editFollowUp || null,
        data_source: editDataSource,
        data_source_url: editDataSourceUrl,
        notes: editNotes,
      })
      if (ok) {
        setEditingId(null)
        showToast({ type: 'success', message: 'Updated' })
      }
    } finally {
      setSaving(false)
    }
  }

  const toggleNotes = (id: string) => {
    setExpandedNotes(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  // Sort: active first, then by follow-up date (overdue at top), then by created_at
  const activeItems = items
    .filter(i => i.status === 'active')
    .sort((a, b) => {
      // Overdue first
      const aDate = a.follow_up_date ? new Date(a.follow_up_date + 'T00:00:00').getTime() : Infinity
      const bDate = b.follow_up_date ? new Date(b.follow_up_date + 'T00:00:00').getTime() : Infinity
      return aDate - bDate
    })
  const completedItems = items.filter(i => i.status === 'completed')
  const pausedItems = items.filter(i => i.status === 'paused')

  const inputClass = "w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
  const textareaClass = "w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] resize-none"

  const renderCard = (item: TrackedItem) => {
    const dueStatus = getDueDateStatus(item.follow_up_date)
    const borderColor = dueStatus && item.status === 'active' ? BORDER_COLORS[dueStatus] : 'border-l-[var(--border)]'
    const isEditing = editingId === item.id
    const notesExpanded = expandedNotes.has(item.id)

    if (isEditing) {
      return (
        <div key={item.id} className={`bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 border-l-4 ${borderColor}`}>
          <div className="space-y-3">
            <Field label="Title">
              <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Description / Goal">
              <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={2} className={textareaClass} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Owner">
                <input value={editOwner} onChange={e => setEditOwner(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Brand">
                <select value={editBrandId} onChange={e => setEditBrandId(e.target.value)} className={inputClass}>
                  <option value="">None</option>
                  {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Follow-up Date">
                <input type="date" value={editFollowUp} onChange={e => setEditFollowUp(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Data Source">
                <input value={editDataSource} onChange={e => setEditDataSource(e.target.value)} placeholder="e.g. Google Sheet, /audits" className={inputClass} />
              </Field>
            </div>
            <Field label="Data Source URL">
              <input type="url" value={editDataSourceUrl} onChange={e => setEditDataSourceUrl(e.target.value)} placeholder="https://..." className={inputClass} />
            </Field>
            <Field label="Notes">
              <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3} className={textareaClass} />
            </Field>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => handleSaveEdit(item.id)}
                disabled={saving || !editTitle.trim()}
                className="px-4 py-2 text-sm font-medium bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="px-4 py-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--text)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div key={item.id} className={`group bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 border-l-4 ${borderColor} transition-colors hover:bg-[var(--surface-hover)]`}>
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-[var(--text)] truncate">{item.title}</h3>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${STATUS_STYLES[item.status]}`}>
                {item.status}
              </span>
            </div>
            {item.description && (
              <p className="text-xs text-[var(--muted)] mb-2 line-clamp-2">{item.description}</p>
            )}
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={() => startEdit(item)}
              className="p-1.5 text-[var(--muted)] hover:text-[var(--accent)] hover:bg-[var(--bg)] rounded-lg transition-colors"
              title="Edit"
            >
              <Pencil size={14} />
            </button>
            {item.status === 'active' && (
              <button
                onClick={() => handleUpdate(item.id, { status: 'completed' })}
                className="p-1.5 text-[var(--muted)] hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                title="Mark complete"
              >
                <Check size={14} />
              </button>
            )}
            {item.status === 'active' && (
              <button
                onClick={() => handleUpdate(item.id, { status: 'paused' })}
                className="p-1.5 text-[var(--muted)] hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                title="Pause"
              >
                <Pause size={14} />
              </button>
            )}
            {item.status === 'paused' && (
              <button
                onClick={() => handleUpdate(item.id, { status: 'active' })}
                className="p-1.5 text-[var(--muted)] hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                title="Resume"
              >
                <Play size={14} />
              </button>
            )}
            {item.status === 'completed' && (
              <button
                onClick={() => handleUpdate(item.id, { status: 'active' })}
                className="p-1.5 text-[var(--muted)] hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                title="Reopen"
              >
                <Play size={14} />
              </button>
            )}
            <button
              onClick={() => handleDelete(item.id, item.title)}
              className="p-1.5 text-[var(--muted)] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--muted)] mt-1">
          {item.owner && (
            <span className="flex items-center gap-1">
              <span className="font-medium text-[var(--text)]">{item.owner}</span>
            </span>
          )}
          {item.entities && (
            <span className="bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full text-[10px] font-medium">
              {item.entities.name}
            </span>
          )}
          {item.follow_up_date && (
            <span className={`flex items-center gap-1 ${dueStatus === 'overdue' ? 'text-red-600 font-medium' : dueStatus === 'due-soon' ? 'text-amber-600' : ''}`}>
              <Clock size={12} />
              {formatDateET(item.follow_up_date)}
              {dueStatus === 'overdue' && ' (overdue)'}
            </span>
          )}
          {item.data_source_url && (
            <a
              href={item.data_source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
            >
              <ExternalLink size={12} />
              {item.data_source || 'Source'}
            </a>
          )}
          {!item.data_source_url && item.data_source && (
            <span>{item.data_source}</span>
          )}
        </div>

        {/* Notes toggle */}
        {item.notes && (
          <div className="mt-3">
            <button
              onClick={() => toggleNotes(item.id)}
              className="text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors flex items-center gap-1"
            >
              {notesExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Notes
            </button>
            {notesExpanded && (
              <p className="text-xs text-[var(--text)] mt-1 pl-4 whitespace-pre-wrap">{item.notes}</p>
            )}
          </div>
        )}

        {/* Updated timestamp */}
        <div className="text-[10px] text-[var(--muted)] mt-2">
          Updated {formatRelativeTime(item.updated_at)}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-[#2c2014] px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Image src="/logo-icon-white.png" alt="Dumpbox" width={32} height={32} />
          </Link>
          <Link href="/" className="text-white font-bold tracking-tight text-lg hover:text-white/90 transition-colors">
            Dumpbox
          </Link>
          <span className="text-white/20 select-none">/</span>
          <span className="text-sm text-white/70 flex items-center gap-1.5">
            <Eye size={14} />
            Tracking
          </span>
        </div>
        <nav className="flex items-center gap-6">
          <a href="/wiki" className="text-base text-white/70 font-medium hover:text-white transition-colors">Wiki</a>
          <a href="/kpis" className="text-base text-white/70 font-medium hover:text-white transition-colors flex items-center gap-1.5"><BarChart3 size={15} />KPIs</a>
          <a href="/tracking" className="text-base text-white font-medium flex items-center gap-1.5"><Eye size={15} />Tracking</a>
          <a href="/history" className="text-base text-white/70 font-medium hover:text-white transition-colors flex items-center gap-1.5"><Clock size={15} />History</a>
          <a href="/links" className="text-base text-white/70 font-medium hover:text-white transition-colors flex items-center gap-1.5"><Link2 size={15} />Links</a>
          <button onClick={handleSignOut} className="text-base text-white/70 font-medium hover:text-white transition-colors">Sign out</button>
        </nav>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1400px] mx-auto px-4 py-8 space-y-6">
          {/* Title + Pin New */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-[var(--text)]">Tracking</h1>
              {!loading && (
                <p className="text-sm text-[var(--muted)] mt-0.5">
                  {activeItems.length} active item{activeItems.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            <button
              onClick={() => setShowPinNew(true)}
              className="px-4 py-2 text-sm font-medium bg-[var(--accent)] text-white rounded-lg
                         hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1.5"
            >
              <Pin size={14} />
              Pin New
            </button>
          </div>

          {/* Loading */}
          {loading && (
            <div className="text-center py-12 text-[var(--muted)]">Loading...</div>
          )}

          {/* Empty state */}
          {!loading && items.length === 0 && (
            <div className="text-center py-16">
              <Eye size={40} className="mx-auto text-[var(--muted)] mb-3 opacity-40" />
              <p className="text-[var(--muted)] text-sm">No tracked items yet</p>
              <p className="text-[var(--muted)] text-xs mt-1">Pin initiatives, reviews, audits, or anything you want to watch</p>
            </div>
          )}

          {/* Active items */}
          {!loading && activeItems.length > 0 && (
            <div className="space-y-3">
              {activeItems.map(renderCard)}
            </div>
          )}

          {/* Paused items */}
          {!loading && pausedItems.length > 0 && (
            <div className="mt-8">
              <button
                onClick={() => setPausedExpanded(!pausedExpanded)}
                className="flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--text)] transition-colors mb-3"
              >
                {pausedExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                Paused ({pausedItems.length})
              </button>
              {pausedExpanded && (
                <div className="space-y-3">
                  {pausedItems.map(renderCard)}
                </div>
              )}
            </div>
          )}

          {/* Completed items */}
          {!loading && completedItems.length > 0 && (
            <div className="mt-8">
              <button
                onClick={() => setCompletedExpanded(!completedExpanded)}
                className="flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--text)] transition-colors mb-3"
              >
                {completedExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                Completed ({completedItems.length})
              </button>
              {completedExpanded && (
                <div className="space-y-3 opacity-70">
                  {completedItems.map(renderCard)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Pin New Modal */}
      {showPinNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowPinNew(false)} />
          <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-[var(--text)]">Pin New Item</h2>
              <button onClick={() => setShowPinNew(false)} className="text-[var(--muted)] hover:text-[var(--text)] transition-colors">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handlePinNew} className="space-y-3">
              <Field label="Title *">
                <input
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="e.g. NiceJob Review Rollout"
                  className={inputClass}
                  autoFocus
                />
              </Field>
              <Field label="Description / Goal">
                <textarea
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  placeholder="What are we tracking and why?"
                  rows={2}
                  className={textareaClass}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Owner">
                  <input
                    value={formOwner}
                    onChange={e => setFormOwner(e.target.value)}
                    placeholder="Who's responsible?"
                    className={inputClass}
                  />
                </Field>
                <Field label="Brand">
                  <select value={formBrandId} onChange={e => setFormBrandId(e.target.value)} className={inputClass}>
                    <option value="">None</option>
                    {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Follow-up Date">
                  <input type="date" value={formFollowUp} onChange={e => setFormFollowUp(e.target.value)} className={inputClass} />
                </Field>
                <Field label="Data Source">
                  <input
                    value={formDataSource}
                    onChange={e => setFormDataSource(e.target.value)}
                    placeholder="e.g. Google Sheet"
                    className={inputClass}
                  />
                </Field>
              </div>
              <Field label="Data Source URL">
                <input
                  type="url"
                  value={formDataSourceUrl}
                  onChange={e => setFormDataSourceUrl(e.target.value)}
                  placeholder="https://..."
                  className={inputClass}
                />
              </Field>
              <Field label="Notes">
                <textarea
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  placeholder="Any additional context..."
                  rows={3}
                  className={textareaClass}
                />
              </Field>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving || !formTitle.trim()}
                  className="px-4 py-2 text-sm font-medium bg-[var(--accent)] text-white rounded-lg
                             hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
                >
                  {saving ? 'Pinning...' : 'Pin Item'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPinNew(false)}
                  className="px-4 py-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--text)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
