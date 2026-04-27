'use client'

import { useState, useEffect, useCallback } from 'react'
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
  Pencil,
  Download,
  Ban,
} from 'lucide-react'

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
  hidden_entity_ids: string[]
  kind: 'link' | 'receipt'
  receipt_meta: {
    vendor: string | null
    amount: number | null
    date: string | null
    payment_method: string | null
    category: string | null
    brand: string | null
  } | null
  file_url: string | null
  file_type: string | null
}

interface LinksResponse {
  links: LinkItem[]
  total: number
}

interface BlocklistEntry {
  id: string
  pattern: string
  type: string
  created_at: string
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

export default function LinksTab() {
  const [links, setLinks] = useState<LinkItem[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [activeKind, setActiveKind] = useState<'all' | 'links' | 'receipts'>('all')
  const [groupByCategory, setGroupByCategory] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addUrl, setAddUrl] = useState('')
  const [addLabel, setAddLabel] = useState('')
  const [addLoading, setAddLoading] = useState(false)

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showBlocklistModal, setShowBlocklistModal] = useState(false)
  const [blocklistEntries, setBlocklistEntries] = useState<BlocklistEntry[]>([])

  // Clear selection when kind/filter/search changes
  useEffect(() => { setSelected(new Set()) }, [activeKind, activeFilter, search])

  const fetchLinks = useCallback(async (query: string, categoryFilter: string, kind: 'all' | 'links' | 'receipts') => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (query) params.set('q', query)
      if (categoryFilter && categoryFilter !== 'all') params.set('category', categoryFilter)
      if (kind !== 'all') params.set('kind', kind)
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
    fetchLinks(search, activeFilter, activeKind)
  }, [search, activeFilter, activeKind, fetchLinks])

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
        fetchLinks(search, activeFilter, activeKind)
      }
    } finally {
      setAddLoading(false)
    }
  }

  const handleDeleteLink = async (idOrUrl: string) => {
    const isUrl = idOrUrl.startsWith('http')
    const param = isUrl ? `url=${encodeURIComponent(idOrUrl)}` : `id=${idOrUrl}`
    const res = await fetch(`/api/links?${param}`, { method: 'DELETE' })
    if (res.ok) {
      fetchLinks(search, activeFilter, activeKind)
    }
  }

  const handleTogglePin = async (url: string, pinned: boolean) => {
    await fetch('/api/links', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, pinned }),
    })
    fetchLinks(search, activeFilter, activeKind)
  }

  const handleUpdateLabel = async (url: string, label: string) => {
    const res = await fetch('/api/links', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, label }),
    })
    if (res.ok) {
      fetchLinks(search, activeFilter, activeKind)
    }
  }

  const handleHideEntity = async (url: string, entityId: string) => {
    const link = links.find(l => l.url === url)
    const currentHidden = link?.hidden_entity_ids ?? []
    const newHidden = [...new Set([...currentHidden, entityId])]

    const res = await fetch('/api/links', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, hidden_entity_ids: newHidden }),
    })
    if (res.ok) {
      fetchLinks(search, activeFilter, activeKind)
    }
  }

  const handleUpdateReceiptMeta = async (url: string, receipt_meta: LinkItem['receipt_meta']) => {
    const res = await fetch('/api/links', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, receipt_meta }),
    })
    if (res.ok) {
      fetchLinks(search, activeFilter, activeKind)
    }
  }

  const handleBulkRemove = async () => {
    for (const url of selected) {
      await handleDeleteLink(url)
    }
    setSelected(new Set())
    fetchLinks(search, activeFilter, activeKind)
  }

  const handleBulkPermanentRemove = async () => {
    if (!confirm(`Block ${selected.size} item${selected.size !== 1 ? 's' : ''}? They won't be ingested again.`)) return
    for (const url of selected) {
      await fetch('/api/blocklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern: url, type: 'url' }),
      })
      const isUrl = url.startsWith('http')
      await fetch(`/api/links?${isUrl ? `url=${encodeURIComponent(url)}` : `id=${url}`}`, { method: 'DELETE' })
    }
    setSelected(new Set())
    fetchLinks(search, activeFilter, activeKind)
  }

  const toggleSelectItem = (url: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(url) ? next.delete(url) : next.add(url)
      return next
    })
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
    <>
      {/* Title + Search + Add */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">Resource Library</h1>
          {!loading && (
            <p className="text-sm text-[var(--muted)] mt-0.5">
              {total} {activeKind === 'receipts' ? 'receipt' : activeKind === 'links' ? 'link' : 'item'}{total !== 1 ? 's' : ''} collected
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

      {/* Kind tabs (All / Links / Receipts) */}
      <div className="flex gap-1 border-b border-[var(--border)] mb-4">
        {(['all', 'links', 'receipts'] as const).map(k => (
          <button
            key={k}
            onClick={() => setActiveKind(k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeKind === k
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            {k === 'all' ? 'All' : k === 'links' ? 'Links' : 'Receipts'}
          </button>
        ))}
      </div>

      {/* Filter Chips + View Toggle + Select All -- only for all/links */}
      {activeKind !== 'receipts' && (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center flex-wrap gap-2">
            {/* Select all checkbox */}
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.size === links.length && links.length > 0}
                onChange={() => {
                  if (selected.size === links.length) {
                    setSelected(new Set())
                  } else {
                    setSelected(new Set(links.map(l => l.url)))
                  }
                }}
                className="rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]"
              />
              <span className="text-xs text-[var(--muted)]">All</span>
            </label>
            <span className="text-[var(--border)] text-xs">|</span>
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
      )}

      {/* Select all for receipts tab */}
      {activeKind === 'receipts' && links.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.size === links.length && links.length > 0}
              onChange={() => {
                if (selected.size === links.length) {
                  setSelected(new Set())
                } else {
                  setSelected(new Set(links.map(l => l.url)))
                }
              }}
              className="rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]"
            />
            <span className="text-xs text-[var(--muted)]">Select all</span>
          </label>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-12 text-center">
          <p className="text-sm text-[var(--muted)]">Loading...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && links.length === 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-12 text-center">
          <Link2 size={32} className="mx-auto text-[var(--muted)] mb-3" />
          <p className="text-[var(--muted)]">
            {search || activeFilter !== 'all' || activeKind !== 'all'
              ? 'No items match your search or filter'
              : 'No items found yet. Links and receipts will appear here as dumplings are processed.'}
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
                    link.kind === 'receipt'
                      ? <ReceiptCard
                          key={link.url}
                          link={link}
                          onDelete={handleDeleteLink}
                          onUpdateReceiptMeta={handleUpdateReceiptMeta}
                          onTogglePin={handleTogglePin}
                          selected={selected.has(link.url)}
                          onSelect={toggleSelectItem}
                        />
                      : <LinkCard
                          key={link.url}
                          link={link}
                          onDelete={handleDeleteLink}
                          onUpdateLabel={handleUpdateLabel}
                          onTogglePin={handleTogglePin}
                          onHideEntity={handleHideEntity}
                          selected={selected.has(link.url)}
                          onSelect={toggleSelectItem}
                        />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Flat list view */}
      {!loading && !groupByCategory && links.length > 0 && (() => {
        const pinnedLinks = links.filter(l => l.pinned)
        const unpinnedLinks = links.filter(l => !l.pinned)
        return (
          <div className="space-y-4">
            {pinnedLinks.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">📌</span>
                  <h2 className="text-sm font-semibold text-[var(--text)]">Pinned</h2>
                </div>
                <div className="space-y-2">
                  {pinnedLinks.map(link => (
                    link.kind === 'receipt'
                      ? <ReceiptCard
                          key={link.url}
                          link={link}
                          onDelete={handleDeleteLink}
                          onUpdateReceiptMeta={handleUpdateReceiptMeta}
                          onTogglePin={handleTogglePin}
                          selected={selected.has(link.url)}
                          onSelect={toggleSelectItem}
                        />
                      : <LinkCard
                          key={link.url}
                          link={link}
                          onDelete={handleDeleteLink}
                          onUpdateLabel={handleUpdateLabel}
                          onTogglePin={handleTogglePin}
                          onHideEntity={handleHideEntity}
                          selected={selected.has(link.url)}
                          onSelect={toggleSelectItem}
                        />
                  ))}
                </div>
              </div>
            )}
            {unpinnedLinks.length > 0 && (
              <div className="space-y-2">
                {unpinnedLinks.map(link => (
                  link.kind === 'receipt'
                    ? <ReceiptCard
                        key={link.url}
                        link={link}
                        onDelete={handleDeleteLink}
                        onUpdateReceiptMeta={handleUpdateReceiptMeta}
                        onTogglePin={handleTogglePin}
                        selected={selected.has(link.url)}
                        onSelect={toggleSelectItem}
                      />
                    : <LinkCard
                        key={link.url}
                        link={link}
                        onDelete={handleDeleteLink}
                        onUpdateLabel={handleUpdateLabel}
                        onTogglePin={handleTogglePin}
                        onHideEntity={handleHideEntity}
                        selected={selected.has(link.url)}
                        onSelect={toggleSelectItem}
                      />
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* Manage blocklist */}
      <div className="text-center py-4">
        <button
          onClick={async () => {
            const res = await fetch('/api/blocklist')
            const data = await res.json()
            setBlocklistEntries(data.entries ?? [])
            setShowBlocklistModal(true)
          }}
          className="text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors"
        >
          Manage blocklist
        </button>
      </div>

      {/* Floating action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#2c2014] text-white rounded-xl px-6 py-3 flex items-center gap-4 shadow-lg z-50">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <button
            onClick={handleBulkRemove}
            className="text-sm px-3 py-1.5 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
          >
            Remove
          </button>
          <button
            onClick={handleBulkPermanentRemove}
            className="text-sm px-3 py-1.5 bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
          >
            Permanently Remove
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-sm text-white/60 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Blocklist modal */}
      {showBlocklistModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
          onClick={() => setShowBlocklistModal(false)}
        >
          <div
            className="bg-white rounded-xl p-6 max-w-lg w-full max-h-[60vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-[var(--text)] mb-4">Blocked Items</h3>
            {blocklistEntries.length === 0 && (
              <p className="text-sm text-[var(--muted)]">No blocked items</p>
            )}
            {blocklistEntries.map(entry => (
              <div key={entry.id} className="flex items-center justify-between py-2 border-b border-[var(--border)]">
                <div>
                  <span className="text-sm text-[var(--text)]">{entry.pattern}</span>
                  <span className="text-xs text-[var(--muted)] ml-2">({entry.type})</span>
                </div>
                <button
                  onClick={async () => {
                    await fetch(`/api/blocklist?id=${entry.id}`, { method: 'DELETE' })
                    setBlocklistEntries(prev => prev.filter(e => e.id !== entry.id))
                  }}
                  className="text-xs text-red-600 hover:text-red-800"
                >
                  Unblock
                </button>
              </div>
            ))}
            <button
              onClick={() => setShowBlocklistModal(false)}
              className="mt-4 text-sm text-[var(--muted)] hover:text-[var(--text)]"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function LinkCard({
  link,
  onDelete,
  onUpdateLabel,
  onTogglePin,
  onHideEntity,
  selected,
  onSelect,
}: {
  link: LinkItem
  onDelete: (id: string) => void
  onUpdateLabel: (url: string, label: string) => Promise<void>
  onTogglePin: (url: string, pinned: boolean) => void
  onHideEntity: (url: string, entityId: string) => void
  selected: boolean
  onSelect: (url: string) => void
}) {
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
    <div className={`group bg-[var(--surface)] border rounded-xl px-5 py-5 transition-colors ${
      link.pinned ? 'border-[var(--accent)]/40' : 'border-[var(--border)] hover:border-[var(--accent)]/30'
    }`}>
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(link.url)}
          className="mt-1 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]"
        />

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
                  className={`group/pill inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${TYPE_PILL_STYLES[e.type] ?? TYPE_PILL_STYLES.topic}`}
                >
                  {e.name}
                  <button
                    onClick={() => onHideEntity(link.url, e.id)}
                    className="opacity-0 group-hover/pill:opacity-100 hover:text-red-600 transition-opacity"
                    title={`Remove ${e.name} tag`}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Pin + Delete + Block buttons */}
        <div className={`flex flex-col gap-1 shrink-0 mt-1 ${link.pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
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
          <button
            onClick={async () => {
              if (!confirm('Block this item permanently?')) return
              await fetch('/api/blocklist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pattern: link.url, type: 'url' }),
              })
              onDelete(link.saved_link_id ? link.saved_link_id : link.url)
            }}
            className="text-[var(--muted)] hover:text-red-600 transition-colors"
            title="Permanently remove (block)"
          >
            <Ban size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

function ReceiptCard({
  link,
  onDelete,
  onUpdateReceiptMeta,
  onTogglePin,
  selected,
  onSelect,
}: {
  link: LinkItem
  onDelete: (id: string) => void
  onUpdateReceiptMeta: (url: string, receipt_meta: LinkItem['receipt_meta']) => Promise<void>
  onTogglePin: (url: string, pinned: boolean) => void
  selected: boolean
  onSelect: (url: string) => void
}) {
  const meta = link.receipt_meta
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editVendor, setEditVendor] = useState(meta?.vendor ?? '')
  const [editAmount, setEditAmount] = useState(meta?.amount != null ? String(meta.amount) : '')
  const [editDate, setEditDate] = useState(meta?.date ?? '')
  const [editBrand, setEditBrand] = useState(meta?.brand ?? '')
  const [editCategory, setEditCategory] = useState(meta?.category ?? '')
  const [editPaymentMethod, setEditPaymentMethod] = useState(meta?.payment_method ?? '')

  const isPdf = link.file_type?.toLowerCase().includes('pdf') || link.file_url?.toLowerCase().endsWith('.pdf')
  const isImage = link.file_type?.toLowerCase().startsWith('image/') ||
    /\.(png|jpg|jpeg|gif|webp)$/i.test(link.file_url ?? '')

  const handleStartEdit = () => {
    setEditVendor(meta?.vendor ?? '')
    setEditAmount(meta?.amount != null ? String(meta.amount) : '')
    setEditDate(meta?.date ?? '')
    setEditBrand(meta?.brand ?? '')
    setEditCategory(meta?.category ?? '')
    setEditPaymentMethod(meta?.payment_method ?? '')
    setEditing(true)
  }

  const handleCancel = () => {
    setEditing(false)
  }

  const handleSave = async () => {
    setSaving(true)
    const updated: LinkItem['receipt_meta'] = {
      vendor: editVendor.trim() || null,
      amount: editAmount ? parseFloat(editAmount) : null,
      date: editDate.trim() || null,
      brand: editBrand.trim() || null,
      category: editCategory.trim() || null,
      payment_method: editPaymentMethod.trim() || null,
    }
    await onUpdateReceiptMeta(link.url, updated)
    setEditing(false)
    setSaving(false)
  }

  const vendorDisplay = meta?.vendor ?? link.display_name ?? 'Receipt'
  const amountDisplay = meta?.amount != null
    ? `$${meta.amount.toFixed(2)}`
    : null
  const dateDisplay = meta?.date ? formatDateET(meta.date) : null

  return (
    <div className="group bg-[var(--surface)] border border-[var(--border)] rounded-xl px-5 py-5
                    hover:border-[var(--accent)]/30 transition-colors">
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(link.url)}
          className="mt-1 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]"
        />

        {/* Receipt icon */}
        <div className="mt-0.5 p-2 rounded-lg bg-amber-50 border border-amber-200">
          <FileText size={16} className="text-amber-700" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {editing ? (
            /* Edit mode */
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-medium text-[var(--muted)] mb-1 uppercase tracking-wide">Vendor</label>
                  <input
                    type="text"
                    value={editVendor}
                    onChange={e => setEditVendor(e.target.value)}
                    placeholder="Vendor name"
                    className="w-full px-2.5 py-1.5 text-sm bg-white border border-[var(--border)] rounded-lg
                               text-[var(--text)] placeholder:text-[var(--muted)]
                               focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-[var(--muted)] mb-1 uppercase tracking-wide">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editAmount}
                    onChange={e => setEditAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-2.5 py-1.5 text-sm bg-white border border-[var(--border)] rounded-lg
                               text-[var(--text)] placeholder:text-[var(--muted)]
                               focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-[var(--muted)] mb-1 uppercase tracking-wide">Date</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={e => setEditDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm bg-white border border-[var(--border)] rounded-lg
                               text-[var(--text)] placeholder:text-[var(--muted)]
                               focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-[var(--muted)] mb-1 uppercase tracking-wide">Brand</label>
                  <input
                    type="text"
                    value={editBrand}
                    onChange={e => setEditBrand(e.target.value)}
                    placeholder="Brand"
                    className="w-full px-2.5 py-1.5 text-sm bg-white border border-[var(--border)] rounded-lg
                               text-[var(--text)] placeholder:text-[var(--muted)]
                               focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-[var(--muted)] mb-1 uppercase tracking-wide">Category</label>
                  <input
                    type="text"
                    value={editCategory}
                    onChange={e => setEditCategory(e.target.value)}
                    placeholder="e.g. Advertising"
                    className="w-full px-2.5 py-1.5 text-sm bg-white border border-[var(--border)] rounded-lg
                               text-[var(--text)] placeholder:text-[var(--muted)]
                               focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-[var(--muted)] mb-1 uppercase tracking-wide">Payment Method</label>
                  <input
                    type="text"
                    value={editPaymentMethod}
                    onChange={e => setEditPaymentMethod(e.target.value)}
                    placeholder="e.g. Amex"
                    className="w-full px-2.5 py-1.5 text-sm bg-white border border-[var(--border)] rounded-lg
                               text-[var(--text)] placeholder:text-[var(--muted)]
                               focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-3 py-1.5 text-xs font-medium bg-[var(--accent)] text-white rounded-lg
                             hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  className="px-3 py-1.5 text-xs font-medium border border-[var(--border)] text-[var(--text)] rounded-lg
                             hover:bg-[var(--surface-hover)] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* View mode */
            <>
              {/* Vendor + Amount row */}
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-sm font-semibold text-[var(--text)] truncate">
                  {vendorDisplay}
                </span>
                {amountDisplay && (
                  <span className="text-sm font-bold text-[var(--accent)] shrink-0">
                    {amountDisplay}
                  </span>
                )}
              </div>

              {/* Date + Brand badge */}
              <div className="flex items-center flex-wrap gap-2 mb-2">
                {dateDisplay && (
                  <span className="text-xs text-[var(--muted)]">{dateDisplay}</span>
                )}
                {meta?.brand && (
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${TYPE_PILL_STYLES.brand}`}>
                    {meta.brand}
                  </span>
                )}
                {meta?.category && (
                  <span className="text-xs px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
                    {meta.category}
                  </span>
                )}
                {meta?.payment_method && (
                  <span className="text-[10px] text-[var(--muted)]">{meta.payment_method}</span>
                )}
              </div>

              {/* File preview / attachment */}
              <div className="flex items-center gap-2 mt-1">
                {link.file_url ? (
                  isImage ? (
                    <img
                      src={link.file_url}
                      alt="Receipt"
                      className="h-10 w-auto rounded border border-[var(--border)] object-cover"
                    />
                  ) : isPdf ? (
                    <span className="flex items-center gap-1 text-xs text-[var(--muted)]">
                      <FileText size={14} className="text-amber-600" />
                      PDF
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-[var(--muted)]">
                      <FileText size={14} />
                      File attached
                    </span>
                  )
                ) : (
                  <span className="text-xs text-[var(--muted)] italic">No file attached</span>
                )}
                {link.file_url && (
                  <a
                    href={link.file_url}
                    download
                    className="flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
                    title="Download receipt"
                  >
                    <Download size={13} />
                    Download
                  </a>
                )}
              </div>
            </>
          )}
        </div>

        {/* Edit + Pin + Delete + Block buttons */}
        <div className="flex flex-col gap-1 shrink-0 mt-1 opacity-0 group-hover:opacity-100">
          {!editing && (
            <button
              onClick={handleStartEdit}
              className="text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
              title="Edit receipt"
            >
              <Pencil size={14} />
            </button>
          )}
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
            title="Remove receipt"
          >
            <X size={14} />
          </button>
          <button
            onClick={async () => {
              if (!confirm('Block this item permanently?')) return
              await fetch('/api/blocklist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pattern: link.url, type: 'url' }),
              })
              onDelete(link.saved_link_id ? link.saved_link_id : link.url)
            }}
            className="text-[var(--muted)] hover:text-red-600 transition-colors"
            title="Permanently remove (block)"
          >
            <Ban size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
