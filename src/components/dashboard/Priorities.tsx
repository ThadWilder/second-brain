'use client'

import { useState, useCallback, useRef } from 'react'
import { Hourglass, X, Eye, Tag, Globe, FolderOpen } from 'lucide-react'
import { TaskCheckbox } from '@/components/ui/TaskCheckbox'
import { useToast } from '@/components/ui/Toast'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { AutoLinkText } from '@/components/ui/AutoLinkText'
import { DetailPanel } from './DetailPanel'
import { TaskDetail } from './TaskDetail'
import { PendingResponseDetail } from './PendingResponseDetail'
import type { TaskWithEntities } from '@/types'

interface BrandHealth {
  entity: { name: string }
  health: 'green' | 'amber' | 'red'
}

interface Props {
  escalated: TaskWithEntities[]
  needsResponse: Array<{ id: string; summary: string; created_at: string }>
  needsReplyTaskIds?: Set<string>
  overdueTasks: TaskWithEntities[]
  tasks: TaskWithEntities[]
  inboxTasks: TaskWithEntities[]
  watchingTasks: TaskWithEntities[]
  overdueFollowUps: TaskWithEntities[]
  staleTracking: TaskWithEntities[]
  consolidationTaskIds?: Set<string>
  commentCounts?: Record<string, number>
  brands?: BrandHealth[]
  onRefresh?: () => void
}

type PanelState =
  | { type: 'task'; id: string; title: string }
  | { type: 'pending'; id: string; title: string }
  | null

export function Priorities({ escalated, needsResponse, needsReplyTaskIds, overdueTasks, tasks, inboxTasks, watchingTasks, overdueFollowUps, staleTracking, consolidationTaskIds, commentCounts, brands, onRefresh }: Props) {
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const [panel, setPanel] = useState<PanelState>(null)
  const { showToast } = useToast()

  const handleComplete = (id: string) => {
    setCompletedIds((prev) => new Set([...prev, id]))
    showToast({
      message: 'Plated ✓',
      type: 'success',
      action: {
        label: 'Undo',
        onClick: () => {
          fetch('/api/tasks', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status: 'open' }),
          })
          setCompletedIds((prev) => {
            const next = new Set(prev)
            next.delete(id)
            return next
          })
        },
      },
    })
  }

  const closePanel = useCallback(() => setPanel(null), [])

  const handleTaskClick = (task: TaskWithEntities) => {
    setPanel({ type: 'task', id: task.id, title: task.description })
  }

  const handlePendingClick = (pr: { id: string; summary: string }) => {
    setPanel({ type: 'pending', id: pr.id, title: pr.summary })
  }

  const handlePanelUpdate = () => {
    onRefresh?.()
  }

  const visibleTasks = tasks.filter((t) => !completedIds.has(t.id))
  const visibleEscalated = escalated.filter((t) => !completedIds.has(t.id))

  return (
    <div className="space-y-5">
      {/* Escalations */}
      {visibleEscalated.length > 0 && (
        <Section id="section-escalations" title="Escalations" icon="🔥" count={visibleEscalated.length}>
          {visibleEscalated.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              variant="escalated"
              hasConsolidation={consolidationTaskIds?.has(task.id)}
              needsReply={needsReplyTaskIds?.has(task.id)}
              commentCount={commentCounts?.[task.id]}
              onComplete={handleComplete}
              onClick={() => handleTaskClick(task)}
              onRefresh={onRefresh}
            />
          ))}
        </Section>
      )}

      {/* Needs Response */}
      {needsResponse.length > 0 && (
        <Section id="section-needs-response" title="Needs Response" icon="📬" count={needsResponse.length}>
          {needsResponse.map((pr) => (
            <div
              key={pr.id}
              onClick={() => handlePendingClick(pr)}
              className="flex items-start gap-3 py-3 px-4 rounded-lg bg-amber-50 border border-amber-200 cursor-pointer hover:bg-amber-100 transition-colors"
            >
              <span className="text-amber-700 shrink-0 mt-0.5">›</span>
              <div className="flex-1 min-w-0">
                <p className="text-base text-[var(--text)]">
                  <AutoLinkText text={pr.summary} />
                </p>
                <p className="text-xs text-[var(--muted)] mt-0.5">
                  {formatAge(pr.created_at)}
                </p>
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Today's Tasks */}
      {visibleTasks.length > 0 && (
        <Section title="Today's Tasks" icon="📋" count={visibleTasks.length}>
          {visibleTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              variant="normal"
              hasConsolidation={consolidationTaskIds?.has(task.id)}
              needsReply={needsReplyTaskIds?.has(task.id)}
              commentCount={commentCounts?.[task.id]}
              onComplete={handleComplete}
              onClick={() => handleTaskClick(task)}
              onRefresh={onRefresh}
            />
          ))}
        </Section>
      )}

      {/* Overdue */}
      {overdueTasks.filter((t) => !completedIds.has(t.id)).length > 0 && (
        <Section title="Overdue" icon="⚠️" count={overdueTasks.filter((t) => !completedIds.has(t.id)).length}>
          {overdueTasks
            .filter((t) => !completedIds.has(t.id))
            .map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                variant="escalated"
                hasConsolidation={consolidationTaskIds?.has(task.id)}
                needsReply={needsReplyTaskIds?.has(task.id)}
                commentCount={commentCounts?.[task.id]}
                onComplete={handleComplete}
                onClick={() => handleTaskClick(task)}
                onRefresh={onRefresh}
              />
            ))}
        </Section>
      )}

      {/* Inbox — grouped by source entry */}
      {inboxTasks.filter((t) => !completedIds.has(t.id)).length > 0 && (
        <Section id="section-inbox" title="Inbox" icon="📥" count={inboxTasks.filter((t) => !completedIds.has(t.id)).length}>
          <InboxGroups
            tasks={inboxTasks.filter((t) => !completedIds.has(t.id))}
            consolidationTaskIds={consolidationTaskIds}
            needsReplyTaskIds={needsReplyTaskIds}
            commentCounts={commentCounts}
            brands={brands}
            onComplete={handleComplete}
            onTaskClick={handleTaskClick}
            onRefresh={onRefresh}
            showToast={showToast}
          />
        </Section>
      )}

      {/* Simmering — collapsible */}
      {watchingTasks.length > 0 && (
        <CollapsiblePrioritySection id="section-watching" title="Watch Only" icon="👁️" count={watchingTasks.length + overdueFollowUps.length + staleTracking.length}>
          {(() => {
            const allWatching = [
              ...watchingTasks.filter((t) => !completedIds.has(t.id)),
              ...overdueFollowUps.filter((t) => !completedIds.has(t.id)),
              ...staleTracking.filter((t) => !completedIds.has(t.id)),
            ]
            // Dedupe by ID in case a task appears in multiple lists
            const seen = new Set<string>()
            const deduped = allWatching.filter(t => {
              if (seen.has(t.id)) return false
              seen.add(t.id)
              return true
            })
            const byPerson = new Map<string, TaskWithEntities[]>()
            for (const task of deduped) {
              const owner = task.tracked_owner ?? task.waiting_on ?? 'Unassigned'
              const existing = byPerson.get(owner) ?? []
              existing.push(task)
              byPerson.set(owner, existing)
            }
            const sorted = Array.from(byPerson.entries()).sort((a, b) => {
              if (a[0] === 'Unassigned') return 1
              if (b[0] === 'Unassigned') return -1
              return a[0].localeCompare(b[0])
            })
            return (
              <div className="space-y-3">
                {sorted.map(([person, tasks]) => (
                  <div key={person}>
                    <p className="text-xs font-medium text-[var(--muted)] mb-1">{person}</p>
                    <div className="space-y-0.5">
                      {tasks.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          variant="normal"
                          hasConsolidation={consolidationTaskIds?.has(task.id)}
                          needsReply={needsReplyTaskIds?.has(task.id)}
                          commentCount={commentCounts?.[task.id]}
                          onComplete={handleComplete}
                          onClick={() => handleTaskClick(task)}
                          onRefresh={onRefresh}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </CollapsiblePrioritySection>
      )}

      {visibleEscalated.length === 0 &&
        needsResponse.length === 0 &&
        overdueTasks.length === 0 &&
        visibleTasks.length === 0 &&
        inboxTasks.length === 0 &&
        watchingTasks.length === 0 &&
        overdueFollowUps.length === 0 &&
        staleTracking.length === 0 && (
          <div className="text-center py-8 text-[var(--muted)] text-sm">
            All clear. No open dumplings.
          </div>
        )}

      {/* Detail Panel */}
      <DetailPanel
        open={panel !== null}
        onClose={closePanel}
        title={panel?.type === 'task' ? 'Task Detail' : 'Pending Response'}
      >
        {panel?.type === 'task' && (
          <TaskDetail taskId={panel.id} onUpdate={handlePanelUpdate} />
        )}
        {panel?.type === 'pending' && (
          <PendingResponseDetail pendingResponseId={panel.id} onUpdate={handlePanelUpdate} />
        )}
      </DetailPanel>
    </div>
  )
}

function InboxGroups({
  tasks,
  consolidationTaskIds,
  needsReplyTaskIds,
  commentCounts,
  brands,
  onComplete,
  onTaskClick,
  onRefresh,
  showToast,
}: {
  tasks: TaskWithEntities[]
  consolidationTaskIds?: Set<string>
  needsReplyTaskIds?: Set<string>
  commentCounts?: Record<string, number>
  brands?: BrandHealth[]
  onComplete: (id: string) => void
  onTaskClick: (task: TaskWithEntities) => void
  onRefresh?: () => void
  showToast: (toast: { message: string; type: 'success' | 'error'; action?: { label: string; onClick: () => void } }) => void
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDismissing, setBulkDismissing] = useState(false)
  const [groupBy, setGroupBy] = useState<'none' | 'project' | 'brand'>('none')

  // Build brand health lookup
  const brandHealth = new Map<string, 'green' | 'amber' | 'red'>()
  for (const b of brands ?? []) {
    brandHealth.set(b.entity.name, b.health)
  }

  // Filter by search
  const filtered = searchQuery.trim()
    ? tasks.filter((t) => t.description.toLowerCase().includes(searchQuery.toLowerCase()))
    : tasks

  // Build groups based on groupBy mode
  const groups: Array<{ key: string; label: string; health?: 'green' | 'amber' | 'red'; tasks: TaskWithEntities[] }> = []

  if (groupBy === 'none') {
    // Flat list -- single group with all tasks
    groups.push({ key: '_all', label: '', tasks: filtered })
  } else if (groupBy === 'project') {
    const byProject = new Map<string, TaskWithEntities[]>()
    for (const task of filtered) {
      const projectEntity = task.entities?.find((e) => e.role === 'project')
      const project = projectEntity?.name ?? '_none'
      const existing = byProject.get(project) ?? []
      existing.push(task)
      byProject.set(project, existing)
    }
    const sorted = Array.from(byProject.entries()).sort((a, b) => {
      if (a[0] === '_none') return 1
      if (b[0] === '_none') return -1
      return a[0].localeCompare(b[0])
    })
    for (const [project, projectTasks] of sorted) {
      groups.push({
        key: project,
        label: project === '_none' ? 'No Project' : project,
        tasks: projectTasks,
      })
    }
  } else {
    // Group by brand
    const byBrand = new Map<string, TaskWithEntities[]>()
    for (const task of filtered) {
      const brandEntity = task.entities?.find((e) => e.role === 'brand')
        ?? task.entities?.find((e) => e.type === 'brand' || e.type === 'department')
      const brand = brandEntity?.name ?? '_none'
      const existing = byBrand.get(brand) ?? []
      existing.push(task)
      byBrand.set(brand, existing)
    }
    const sorted = Array.from(byBrand.entries()).sort((a, b) => {
      if (a[0] === '_none') return -1
      if (b[0] === '_none') return 1
      if (b[1].length !== a[1].length) return b[1].length - a[1].length
      return a[0].localeCompare(b[0])
    })
    for (const [brand, brandTasks] of sorted) {
      groups.push({
        key: brand,
        label: brand === '_none' ? 'Ungrouped' : brand,
        health: brandHealth.get(brand),
        tasks: brandTasks,
      })
    }
  }

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function bulkDismiss() {
    setBulkDismissing(true)
    const dismissedIds = Array.from(selectedIds)
    try {
      await Promise.all(
        dismissedIds.map((id) =>
          fetch('/api/tasks', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status: 'dismissed' }),
          })
        )
      )
      setSelectedIds(new Set())
      onRefresh?.()
      const count = dismissedIds.length
      showToast({
        message: `Dismissed ${count} task${count > 1 ? 's' : ''}`,
        type: 'success',
        action: {
          label: 'Undo',
          onClick: () => {
            Promise.all(
              dismissedIds.map((id) =>
                fetch('/api/tasks', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id, status: 'open' }),
                })
              )
            ).then(() => onRefresh?.())
          },
        },
      })
    } finally {
      setBulkDismissing(false)
    }
  }

  async function bulkMerge() {
    const ids = Array.from(selectedIds)
    if (ids.length < 2) return
    setBulkDismissing(true)
    try {
      // Find selected tasks in order
      const selected = ids.map((id) => tasks.find((t) => t.id === id)).filter(Boolean) as TaskWithEntities[]
      const keepTask = selected[0]
      const others = selected.slice(1)

      // Build merged description
      const merged = keepTask.description + '\n\nMerged items:\n' +
        others.map((t) => `• ${t.description}`).join('\n')

      // Update kept task description
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: keepTask.id, description: merged }),
      })

      // Dismiss the rest
      await Promise.all(
        others.map((t) =>
          fetch('/api/tasks', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: t.id, status: 'dismissed' }),
          })
        )
      )
      setSelectedIds(new Set())
      onRefresh?.()
    } finally {
      setBulkDismissing(false)
    }
  }

  const healthDot = (h?: 'green' | 'amber' | 'red') => {
    if (!h) return null
    const color = h === 'red' ? 'bg-red-500' : h === 'amber' ? 'bg-amber-400' : 'bg-green-400'
    return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
  }

  return (
    <div className="space-y-2">
      {/* Search + group toggle + bulk actions */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search..."
          className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
        />
        <select
          value={groupBy}
          onChange={(e) => { setGroupBy(e.target.value as 'none' | 'project' | 'brand'); setExpandedGroups(new Set()) }}
          className="text-xs px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] cursor-pointer focus:outline-none focus:border-[var(--accent)]"
        >
          <option value="none">No grouping</option>
          <option value="project">By Project</option>
          <option value="brand">By Brand</option>
        </select>
        {selectedIds.size >= 2 && (
          <button
            onClick={bulkMerge}
            disabled={bulkDismissing}
            className="px-3 py-1.5 text-xs rounded-lg border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors disabled:opacity-50"
          >
            {bulkDismissing ? 'Merging...' : `Merge ${selectedIds.size}`}
          </button>
        )}
        {selectedIds.size > 0 && (
          <button
            onClick={bulkDismiss}
            disabled={bulkDismissing}
            className="px-3 py-1.5 text-xs rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            {bulkDismissing ? 'Dismissing...' : `Dismiss ${selectedIds.size}`}
          </button>
        )}
      </div>

      {/* Tasks */}
      <div className="space-y-1">
        {groups.map(({ key, label, health, tasks: groupTasks }) => {
          if (groupBy === 'none') {
            // Flat list -- no group headers
            return (
              <div key={key} className="space-y-0.5">
                {groupTasks.map((task) => (
                  <div key={task.id} className="flex items-start gap-1">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(task.id)}
                      onChange={() => toggleSelect(task.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-3.5 shrink-0 accent-[var(--accent)]"
                    />
                    <div className="flex-1 min-w-0">
                      <TaskRow
                        task={task}
                        variant="normal"
                        hasConsolidation={consolidationTaskIds?.has(task.id)}
                        needsReply={needsReplyTaskIds?.has(task.id)}
                        commentCount={commentCounts?.[task.id]}
                        onComplete={onComplete}
                        onClick={() => onTaskClick(task)}
                        onRefresh={onRefresh}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )
          }
          // Grouped view
          const isExpanded = expandedGroups.has(key)
          return (
            <div key={key}>
              <button
                onClick={() => toggleGroup(key)}
                className="w-full flex items-center gap-2 py-2 px-1 text-left hover:bg-[var(--surface-hover)] transition-colors rounded"
              >
                <span className="text-sm text-[var(--muted)] font-mono">{isExpanded ? '▼' : '▶'}</span>
                {healthDot(health)}
                <span className="text-base font-semibold text-[var(--text)]">{label}</span>
                <span className="text-sm text-[var(--muted)]">{groupTasks.length}</span>
              </button>
              {isExpanded && (
                <div className="ml-3 border-l-2 border-[var(--border)] pl-2 space-y-0.5">
                  {groupTasks.map((task) => (
                    <div key={task.id} className="flex items-start gap-1">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(task.id)}
                        onChange={() => toggleSelect(task.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-3.5 shrink-0 accent-[var(--accent)]"
                      />
                      <div className="flex-1 min-w-0">
                        <TaskRow
                          task={task}
                          variant="normal"
                          hasConsolidation={consolidationTaskIds?.has(task.id)}
                          needsReply={needsReplyTaskIds?.has(task.id)}
                          commentCount={commentCounts?.[task.id]}
                          onComplete={onComplete}
                          onClick={() => onTaskClick(task)}
                          onRefresh={onRefresh}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CollapsiblePrioritySection({ id, title, icon, count, children }: { id?: string; title: string; icon: string; count: number; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div id={id}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 mb-2 hover:opacity-80 transition-opacity"
      >
        <span className="text-sm text-[var(--muted)] font-mono">{expanded ? '▼' : '▶'}</span>
        <span className="text-base">{icon}</span>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">{title}</h3>
        <span className="text-xs text-[var(--muted)]">{count}</span>
      </button>
      {expanded && <div className="space-y-1">{children}</div>}
    </div>
  )
}

function Section({
  id,
  title,
  icon,
  count,
  children,
}: {
  id?: string
  title: string
  icon: string
  count: number
  children: React.ReactNode
}) {
  return (
    <div id={id}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">{icon}</span>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">
          {title}
        </h3>
        <span className="text-sm text-[var(--muted)] ml-1">({count})</span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function TaskRow({
  task,
  variant,
  hasConsolidation,
  needsReply,
  commentCount,
  onComplete,
  onClick,
  onRefresh,
}: {
  task: TaskWithEntities
  variant: 'escalated' | 'normal' | 'stale'
  hasConsolidation?: boolean
  needsReply?: boolean
  commentCount?: number
  onComplete: (id: string) => void
  onClick: () => void
  onRefresh?: () => void
}) {
  const brand = task.entities?.find((e) => e.role === 'brand')
  const [showWaitingPopover, setShowWaitingPopover] = useState(false)
  const [waitingInput, setWaitingInput] = useState('')
  const [showTrackingPopover, setShowTrackingPopover] = useState(false)
  const [trackingOwner, setTrackingOwner] = useState('')
  const [trackingFollowUp, setTrackingFollowUp] = useState('')
  const [showTagPopover, setShowTagPopover] = useState(false)
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const trackingInputRef = useRef<HTMLInputElement>(null)

  async function setWaitingOn(value: string) {
    setSaving(true)
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, waiting_on: value || null }),
      })
      setShowWaitingPopover(false)
      setWaitingInput('')
      onRefresh?.()
    } finally {
      setSaving(false)
    }
  }

  async function setTracking(owner: string, followUpDate: string) {
    setSaving(true)
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: task.id,
          status: 'tracking',
          tracked_owner: owner || null,
          follow_up_date: followUpDate || null,
          public: true,
        }),
      })
      setShowTrackingPopover(false)
      setTrackingOwner('')
      setTrackingFollowUp('')
      onRefresh?.()
    } finally {
      setSaving(false)
    }
  }

  async function openTagPopover() {
    setShowTagPopover(true)
    // Fetch available tags
    try {
      const res = await fetch('/api/tags')
      const data = await res.json()
      setAvailableTags((data.tags ?? []).map((t: { tag: string }) => t.tag))
    } catch { /* ignore */ }
  }

  async function quickAddTag(tag: string) {
    setSaving(true)
    try {
      const currentTags = task.tags ?? []
      if (currentTags.includes(tag)) {
        setShowTagPopover(false)
        return
      }
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, tags: [...currentTags, tag] }),
      })
      setShowTagPopover(false)
      onRefresh?.()
    } finally {
      setSaving(false)
    }
  }

  const variantStyles = {
    escalated: 'bg-red-50 border-red-200',
    normal: 'bg-[var(--surface)] border-[var(--border)]',
    stale: 'bg-[var(--surface)] border-[var(--border)] opacity-75',
  }

  return (
    <div
      className={`group flex items-start gap-3 py-3 px-4 rounded-lg border cursor-pointer hover:shadow-sm transition-shadow ${variantStyles[variant]}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <TaskCheckbox
          taskId={task.id}
          checked={task.status === 'done'}
          onComplete={onComplete}
        />
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (task.waiting_on) {
                setWaitingOn('')
              } else {
                setShowWaitingPopover(true)
                setTimeout(() => inputRef.current?.focus(), 0)
              }
            }}
            title={task.waiting_on ? `Waiting on ${task.waiting_on} — click to clear` : 'Set waiting on'}
            className={`p-0.5 rounded transition-colors ${
              task.waiting_on
                ? 'text-amber-600 hover:text-red-600'
                : 'text-[var(--muted)] hover:text-amber-600 opacity-0 group-hover:opacity-100'
            }`}
          >
            <Hourglass className="w-3.5 h-3.5" />
          </button>
          {showWaitingPopover && (
            <div
              className="absolute z-20 top-full left-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg p-2 w-48"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-1">
                <input
                  ref={inputRef}
                  value={waitingInput}
                  onChange={(e) => setWaitingInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && waitingInput.trim()) setWaitingOn(waitingInput.trim())
                    if (e.key === 'Escape') { setShowWaitingPopover(false); setWaitingInput('') }
                  }}
                  placeholder="Waiting on..."
                  className="flex-1 text-xs px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
                />
                <button
                  onClick={() => waitingInput.trim() && setWaitingOn(waitingInput.trim())}
                  disabled={!waitingInput.trim() || saving}
                  className="px-1.5 py-1 text-[10px] rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
                >
                  {saving ? '...' : 'Set'}
                </button>
                <button
                  onClick={() => { setShowWaitingPopover(false); setWaitingInput('') }}
                  className="p-1 text-[var(--muted)] hover:text-[var(--text)]"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
        {/* Eye icon for tracking */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (task.status === 'tracking') {
                // Already tracking — clicking clears it back to open
                fetch('/api/tasks', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: task.id, status: 'open', tracked_owner: null, follow_up_date: null }),
                }).then(() => onRefresh?.())
              } else {
                setShowTrackingPopover(true)
                setTimeout(() => trackingInputRef.current?.focus(), 0)
              }
            }}
            title={task.status === 'tracking' ? `Tracking (${task.tracked_owner ?? 'no owner'}) — click to stop tracking` : 'Track this task'}
            className={`p-0.5 rounded transition-colors ${
              task.status === 'tracking'
                ? 'text-purple-600 hover:text-red-600'
                : 'text-[var(--muted)] hover:text-purple-600 opacity-0 group-hover:opacity-100'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          {showTrackingPopover && (
            <div
              className="absolute z-20 top-full left-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg p-2 w-56"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-1.5">
                <input
                  ref={trackingInputRef}
                  value={trackingOwner}
                  onChange={(e) => setTrackingOwner(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setTracking(trackingOwner.trim(), trackingFollowUp)
                    if (e.key === 'Escape') { setShowTrackingPopover(false); setTrackingOwner(''); setTrackingFollowUp('') }
                  }}
                  placeholder="Owner..."
                  className="w-full text-xs px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
                />
                <input
                  type="date"
                  value={trackingFollowUp}
                  onChange={(e) => setTrackingFollowUp(e.target.value)}
                  className="w-full text-xs px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                />
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setTracking(trackingOwner.trim(), trackingFollowUp)}
                    disabled={saving}
                    className="flex-1 px-1.5 py-1 text-[10px] rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40 transition-colors"
                  >
                    {saving ? '...' : 'Track'}
                  </button>
                  <button
                    onClick={() => { setShowTrackingPopover(false); setTrackingOwner(''); setTrackingFollowUp('') }}
                    className="p-1 text-[var(--muted)] hover:text-[var(--text)]"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        {/* Tag icon for quick tagging */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (showTagPopover) {
                setShowTagPopover(false)
              } else {
                openTagPopover()
              }
            }}
            title="Add tag"
            className={`p-0.5 rounded transition-colors ${
              (task.tags ?? []).length > 0
                ? 'text-[var(--accent)]'
                : 'text-[var(--muted)] hover:text-[var(--accent)] opacity-0 group-hover:opacity-100'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
          </button>
          {showTagPopover && (
            <div
              className="absolute z-20 top-full left-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg p-2 w-44"
              onClick={(e) => e.stopPropagation()}
            >
              {availableTags.length === 0 ? (
                <p className="text-xs text-[var(--muted)] px-1 py-1">No tags yet</p>
              ) : (
                <div className="max-h-32 overflow-y-auto space-y-0.5">
                  {availableTags.map((t) => {
                    const isApplied = (task.tags ?? []).includes(t)
                    return (
                      <button
                        key={t}
                        onClick={() => !isApplied && quickAddTag(t)}
                        disabled={isApplied || saving}
                        className={`w-full text-left px-2 py-1 text-xs rounded transition-colors ${
                          isApplied
                            ? 'text-[var(--muted)] bg-[var(--bg)]'
                            : 'hover:bg-[var(--surface-hover)] text-[var(--text)]'
                        }`}
                      >
                        {t} {isApplied && '✓'}
                      </button>
                    )
                  })}
                </div>
              )}
              <button
                onClick={() => setShowTagPopover(false)}
                className="w-full text-left px-2 py-1 text-[10px] text-[var(--muted)] hover:text-[var(--text)] mt-1 border-t border-[var(--border)] pt-1"
              >
                Close
              </button>
            </div>
          )}
        </div>
        {/* Globe icon for public toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            const newPublic = !task.public
            // Optimistic update via onRefresh after PATCH
            fetch('/api/tasks', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: task.id, public: newPublic }),
            }).then(() => onRefresh?.())
          }}
          title={task.public ? 'Make private' : 'Make public'}
          className={`p-0.5 rounded transition-colors ${
            task.public
              ? 'text-teal-600 hover:text-red-600'
              : 'text-[var(--muted)] hover:text-teal-600 opacity-0 group-hover:opacity-100'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base text-[var(--text)] leading-snug">
          {task.public && <span title="Public" className="inline mr-1 -mt-0.5"><Globe className="w-3.5 h-3.5 text-teal-600 inline" /></span>}
          <AutoLinkText text={task.description} />
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {needsReply && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-50 text-amber-700 border border-amber-200">
              📬 needs reply
            </span>
          )}
          {hasConsolidation && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-violet-50 text-violet-700 border border-violet-200">
              Related task found
            </span>
          )}
          {brand && (
            <span className="text-xs text-[var(--muted)]">{brand.name}</span>
          )}
          {task.entities?.filter(e => e.role === 'project').map(e => (
            <span key={e.id} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
              <FolderOpen className="w-2.5 h-2.5" />
              {e.name}
            </span>
          ))}
          {task.due_date && (
            <span className="text-xs text-[var(--muted)]">
              due {task.due_date}
            </span>
          )}
          {task.waiting_on && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
              ⏳ {isMe(task.waiting_on) ? 'You' : task.waiting_on}
            </span>
          )}
          {task.status === 'tracking' && (
            <span className="inline-flex items-center gap-1 text-xs text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
              👁️ {task.tracked_owner ?? 'tracking'}
            </span>
          )}
          {(task.tags ?? []).map((t) => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)]">
              {t}
            </span>
          ))}
          {(commentCount ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-50 text-amber-700 border border-amber-200">
              💬 {commentCount}
            </span>
          )}
          {task.status !== 'open' && task.status !== 'tracking' && (
            <StatusBadge status={task.status} />
          )}
          {taskAge(task.created_at)}
        </div>
      </div>
    </div>
  )
}

function taskAge(createdAt: string): React.ReactNode {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24))
  if (days < 7) return null
  const weeks = Math.floor(days / 7)
  const label = weeks >= 4 ? `${Math.floor(weeks / 4)}mo` : `${weeks}w`
  return (
    <span className={`text-[10px] px-1 py-0.5 rounded ${days >= 21 ? 'text-red-500' : 'text-[var(--muted)]'}`}>
      {label}
    </span>
  )
}

function isMe(name: string | null | undefined): boolean {
  if (!name) return false
  const n = name.toLowerCase().trim()
  return n === 'brandy murch' || n === 'brandy'
}

function formatAge(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
