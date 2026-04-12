'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  Link2,
  Search,
  FileSpreadsheet,
  FileText,
  Presentation,
  FolderOpen,
  ExternalLink,
  Plus,
  X,
  LayoutList,
  LayoutGrid,
  Clock,
  Eye,
  Pencil,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/browser'

interface LinkSource {
  entry_id: string
  subject: string | null
  date: string
}

interface LinkEntity {
  id: string
  name: string
  type: string
}

interface LinkItem {
  url: string
  category: string
  domain: string
  label: string | null
  display_name: string
  sources: LinkSource[]
  entities: LinkEntity[]
  first_seen: string
  last_seen: string
  saved_link_id: string | null
  pinned: boolean
}

interface LinksResponse {
  links: LinkItem[]
  total: number
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof FileSpreadsheet; color: string; bgColor: string; borderColor: string }> = {
  spreadsheet: { label: 'Spreadsheet', icon: FileSpreadsheet, color: 'text-green-700', bgColor: 'bg-green-50', borderColor: 'border-green-200' },
  document: { label: 'Document', icon: FileText, color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' },
  presentation: { label: 'Presentation', icon: Presentation, color: 'text-orange-700', bgColor: 'bg-orange-50', borderColor: 'border-orange-200' },
  drive: { label: 'Drive', icon: FolderOpen, color: 'text-yellow-700', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200' },
  sharepoint: { label: 'SharePoint', icon: FolderOpen, color: 'text-purple-700', bgColor: 'bg-purple-50', borderColor: 'border-purple-200' },
  other: { label: 'Other', icon: Link2, color: 'text-gray-600', bgColor: 'bg-gray-50', borderColor: 'border-gray-200' },
}

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'spreadsheet', label: 'Spreadsheets' },
  { value: 'document', label: 'Documents' },
  { value: 'presentation', label: 'Presentations' },
  { value: 'drive', label: 'Drive' },
  { value: 'sharepoint', label: 'SharePoint' },
  { value: 'other', label: 'Other' },
]

const TYPE_PILL_STYLES: Record<string, string> = {
  brand: 'bg-blue-50 text-blue-700 border-blue-200',
  contact: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  vendor: 'bg-purple-50 text-purple-700 border-purple-200',
  department: 'bg-amber-50 text-amber-700 border-amber-200',
  franchisee: 'bg-orange-50 text-orange-700 border-orange-200',
  vendor_team: 'bg-violet-50 text-violet-700 border-violet-200',
  freelancer: 'bg-teal-50 text-teal-700 border-teal-200',
  topic: 'bg-gray-50 text-gray-600 border-gray-200',
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

function truncateUrl(url: string, maxLen: number = 60): string {
  if (url.length <= maxLen) return url
  try {
    const parsed = new URL(url)
    const base = parsed.hostname + parsed.pathname
    if (base.length <= maxLen) return base
    return base.slice(0, maxLen - 3) + '...'
  } catch {
    return url.slice(0, maxLen - 3) + '...'
  }
}

export default function LinksPage() {
  const [links, setLinks] = useState<LinkItem[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [groupByCategory, setGroupByCategory] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addUrl, setAddUrl] = useState('')
  const [addLabel, setAddLabel] = useState('')
  const [addLoading, setAddLoading] = useState(false)

  const fetchLinks = useCallback(async (query: string, typeFilter: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (query) params.set('q', query)
      if (typeFilter && typeFilter !== 'all') params.set('type', typeFilter)
      const res = await fetch(`/api/links?${params}`)
      if (!res.ok) return
      const data: LinksResponse = await res.json()
      setLinks(data.links)
      setTotal(data.total)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLinks(search, activeFilter)
  }, [search, activeFilter, fetchLinks])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
  }

  const handleFilterChange = (value: string) => {
    setActiveFilter(value)
  }

  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addUrl.trim()) return
    setAddLoading(true)
    try {
      const res = await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: addUrl.trim(), label: addLabel.trim() || undefined }),
      })
      if (res.ok) {
        setAddUrl('')
        setAddLabel('')
        setShowAddForm(false)
        fetchLinks(search, activeFilter)
      }
    } finally {
      setAddLoading(false)
    }
  }

  const handleDeleteLink = async (idOrUrl: string) => {
    // If it looks like a URL, delete by URL (extracted link); otherwise by ID (saved link)
    const isUrl = idOrUrl.startsWith('http')
    const param = isUrl ? `url=${encodeURIComponent(idOrUrl)}` : `id=${idOrUrl}`
    const res = await fetch(`/api/links?${param}`, { method: 'DELETE' })
    if (res.ok) {
      fetchLinks(search, activeFilter)
    }
  }

  const handleTogglePin = async (url: string, pinned: boolean) => {
    await fetch('/api/links', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, pinned }),
    })
    fetchLinks(search, activeFilter)
  }

  const handleUpdateLabel = async (url: string, label: string) => {
    const res = await fetch('/api/links', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, label }),
    })
    if (res.ok) {
      fetchLinks(search, activeFilter)
    }
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  // Group links by category if toggled
  const groupedLinks = groupByCategory
    ? FILTER_OPTIONS.filter(f => f.value !== 'all').reduce((acc, f) => {
        const items = links.filter(l => l.category === f.value)
        if (items.length > 0) acc.push({ category: f.value, label: f.label, items })
        return acc
      }, [] as { category: string; label: string; items: LinkItem[] }[])
    : null

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
            <Link2 size={14} />
            Links
          </span>
        </div>
        <nav className="flex items-center gap-6">
          <a href="/wiki" className="text-base text-white/70 font-medium hover:text-white transition-colors">Wiki</a>
          <a href="/kpis" className="text-base text-white/70 font-medium hover:text-white transition-colors">KPIs</a>
          <a href="/tracking" className="text-base text-white/70 font-medium hover:text-white transition-colors flex items-center gap-1.5"><Eye size={15} />The Kitchen</a>
          <a href="/history" className="text-base text-white/70 font-medium hover:text-white transition-colors flex items-center gap-1.5"><Clock size={15} />History</a>
          <a href="/links" className="text-base text-white font-medium flex items-center gap-1.5"><Link2 size={15} />Links</a>
          <button onClick={handleSignOut} className="text-base text-white/70 font-medium hover:text-white transition-colors">Sign out</button>
        </nav>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1100px] mx-auto px-4 py-8 space-y-6">
          {/* Title + Search + Add */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-[var(--text)]">Resource Library</h1>
              {!loading && (
                <p className="text-sm text-[var(--muted)] mt-0.5">
                  {total} link{total !== 1 ? 's' : ''} collected
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    placeholder="Search links..."
                    className="pl-9 pr-3 py-2 text-sm bg-[var(--surface)] border border-[var(--border)] rounded-lg
                               text-[var(--text)] placeholder:text-[var(--muted)]
                               focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent
                               w-56"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3 py-2 text-sm font-medium bg-[var(--accent)] text-white rounded-lg
                             hover:bg-[var(--accent-hover)] transition-colors"
                >
                  Search
                </button>
              </form>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="px-3 py-2 text-sm font-medium border border-[var(--border)] text-[var(--text)] rounded-lg
                           hover:bg-[var(--surface-hover)] transition-colors flex items-center gap-1.5"
              >
                <Plus size={14} />
                Add Link
              </button>
            </div>
          </div>

          {/* Add Link Form */}
          {showAddForm && (
            <form
              onSubmit={handleAddLink}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--text)]">Add a link</span>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="text-[var(--muted)] hover:text-[var(--text)] transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={addUrl}
                  onChange={e => setAddUrl(e.target.value)}
                  placeholder="https://..."
                  required
                  className="flex-1 px-3 py-2 text-sm bg-white border border-[var(--border)] rounded-lg
                             text-[var(--text)] placeholder:text-[var(--muted)]
                             focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                />
                <input
                  type="text"
                  value={addLabel}
                  onChange={e => setAddLabel(e.target.value)}
                  placeholder="Label (optional)"
                  className="w-48 px-3 py-2 text-sm bg-white border border-[var(--border)] rounded-lg
                             text-[var(--text)] placeholder:text-[var(--muted)]
                             focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                />
                <button
                  type="submit"
                  disabled={addLoading}
                  className="px-4 py-2 text-sm font-medium bg-[var(--accent)] text-white rounded-lg
                             hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
                >
                  {addLoading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          )}

          {/* Filter Chips + View Toggle */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              {FILTER_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleFilterChange(opt.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                    activeFilter === opt.value
                      ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                      : 'bg-[var(--surface)] text-[var(--text)] border-[var(--border)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setGroupByCategory(!groupByCategory)}
              className="text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors flex items-center gap-1"
              title={groupByCategory ? 'Show as flat list' : 'Group by category'}
            >
              {groupByCategory ? <LayoutList size={14} /> : <LayoutGrid size={14} />}
              {groupByCategory ? 'Flat' : 'Group'}
            </button>
          </div>

          {/* Loading state */}
          {loading && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-12 text-center">
              <p className="text-sm text-[var(--muted)]">Loading links...</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && links.length === 0 && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-12 text-center">
              <Link2 size={32} className="mx-auto text-[var(--muted)] mb-3" />
              <p className="text-[var(--muted)]">
                {search || activeFilter !== 'all'
                  ? 'No links match your search or filter'
                  : 'No links found yet. Links will appear here as dumplings are processed.'}
              </p>
            </div>
          )}

          {/* Grouped view */}
          {!loading && groupByCategory && groupedLinks && groupedLinks.length > 0 && (
            <div className="space-y-6">
              {groupedLinks.map(group => {
                const config = CATEGORY_CONFIG[group.category]
                const GroupIcon = config?.icon ?? Link2
                return (
                  <div key={group.category}>
                    <div className="flex items-center gap-2 mb-3">
                      <GroupIcon size={16} className={config?.color ?? 'text-[var(--muted)]'} />
                      <h2 className="text-sm font-semibold text-[var(--text)]">
                        {group.label}
                      </h2>
                      <span className="text-xs text-[var(--muted)]">({group.items.length})</span>
                    </div>
                    <div className="space-y-2">
                      {group.items.map(link => (
                        <LinkCard key={link.url} link={link} onDelete={handleDeleteLink} onUpdateLabel={handleUpdateLabel} onTogglePin={handleTogglePin} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Flat list view */}
          {!loading && !groupByCategory && links.length > 0 && (
            <div className="space-y-2">
              {links.map(link => (
                <LinkCard key={link.url} link={link} onDelete={handleDeleteLink} onUpdateLabel={handleUpdateLabel} onTogglePin={handleTogglePin} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function LinkCard({ link, onDelete, onUpdateLabel, onTogglePin }: { link: LinkItem; onDelete: (id: string) => void; onUpdateLabel: (url: string, label: string) => Promise<void>; onTogglePin: (url: string, pinned: boolean) => void }) {
  const config = CATEGORY_CONFIG[link.category] ?? CATEGORY_CONFIG.other
  const TypeIcon = config.icon
  const primarySource = link.sources[0]
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(link.display_name)
  const [saving, setSaving] = useState(false)

  const handleStartEdit = () => {
    setEditValue(link.display_name)
    setEditing(true)
  }

  const handleCancel = () => {
    setEditing(false)
    setEditValue(link.display_name)
  }

  const handleSave = async () => {
    const trimmed = editValue.trim()
    if (!trimmed || trimmed === link.display_name) {
      handleCancel()
      return
    }
    setSaving(true)
    await onUpdateLabel(link.url, trimmed)
    setEditing(false)
    setSaving(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  return (
    <div className="group bg-[var(--surface)] border border-[var(--border)] rounded-xl px-5 py-5
                    hover:border-[var(--accent)]/30 transition-colors">
      <div className="flex items-start gap-3">
        {/* Type icon */}
        <div className={`mt-0.5 p-2 rounded-lg ${config.bgColor} ${config.borderColor} border`}>
          <TypeIcon size={16} className={config.color} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center gap-2 mb-1">
            {editing ? (
              <input
                type="text"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleSave}
                disabled={saving}
                autoFocus
                className="text-sm font-semibold text-[var(--text)] bg-white border border-[var(--accent)] rounded px-2 py-0.5
                           focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent
                           min-w-0 flex-1"
              />
            ) : (
              <>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-[var(--text)] hover:text-[var(--accent)] transition-colors truncate"
                >
                  {link.display_name}
                </a>
                <button
                  onClick={handleStartEdit}
                  className="text-[var(--muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--accent)] transition-all shrink-0"
                  title="Edit label"
                >
                  <Pencil size={12} />
                </button>
              </>
            )}
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--muted)] hover:text-[var(--accent)] shrink-0"
            >
              <ExternalLink size={12} />
            </a>
          </div>

          {/* URL */}
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--muted)] hover:text-[var(--accent)] transition-colors block truncate mb-2"
          >
            {truncateUrl(link.url, 80)}
          </a>

          {/* Meta row */}
          <div className="flex items-center flex-wrap gap-2">
            {/* Category badge */}
            <span className={`text-xs px-2 py-0.5 rounded-full border ${config.bgColor} ${config.color} ${config.borderColor}`}>
              {config.label}
            </span>

            {/* Source */}
            {primarySource && (
              <span className="text-[10px] text-[var(--muted)]">
                From: {primarySource.subject ?? 'Untitled'} &middot; {formatDateET(primarySource.date)}
              </span>
            )}

            {/* Multiple sources indicator */}
            {link.sources.length > 1 && (
              <span className="text-[10px] text-[var(--muted)]">
                (+{link.sources.length - 1} more)
              </span>
            )}

            {/* Manual link indicator */}
            {link.saved_link_id && link.sources.length === 0 && (
              <span className="text-[10px] text-[var(--muted)]">
                Manually added &middot; {formatDateET(link.first_seen)}
              </span>
            )}
          </div>

          {/* Entity pills */}
          {link.entities.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {link.entities.map(e => (
                <span
                  key={e.id}
                  className={`text-xs px-2 py-0.5 rounded-full border ${TYPE_PILL_STYLES[e.type] ?? TYPE_PILL_STYLES.topic}`}
                >
                  {e.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Pin + Delete buttons */}
        <div className="flex flex-col gap-1 shrink-0 mt-1 opacity-0 group-hover:opacity-100">
          <button
            onClick={() => onTogglePin(link.url, !link.pinned)}
            className={`transition-colors ${link.pinned ? 'text-[var(--accent)]' : 'text-[var(--muted)] hover:text-[var(--accent)]'}`}
            title={link.pinned ? 'Unpin from Kitchen' : 'Pin to Kitchen'}
          >
            📌
          </button>
          <button
            onClick={() => link.saved_link_id ? onDelete(link.saved_link_id) : onDelete(link.url)}
            className="text-[var(--muted)] hover:text-[var(--danger)] transition-colors"
            title="Remove link"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
