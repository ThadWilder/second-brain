'use client'

import { useState, useCallback, useRef } from 'react'
import { Hourglass, X, Eye } from 'lucide-react'
import { TaskCheckbox } from '@/components/ui/TaskCheckbox'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { AutoLinkText } from '@/components/ui/AutoLinkText'
import { DetailPanel } from './DetailPanel'
import { TaskDetail } from './TaskDetail'
import { PendingResponseDetail } from './PendingResponseDetail'
import type { TaskWithEntities } from '@/types'

interface Props {
  escalated: TaskWithEntities[]
  needsResponse: Array<{ id: string; summary: string; created_at: string }>
  needsReplyTaskIds?: Set<string>
  overdueTasks: TaskWithEntities[]
  tasks: TaskWithEntities[]
  inboxTasks: TaskWithEntities[]
  overdueFollowUps: TaskWithEntities[]
  staleTracking: TaskWithEntities[]
  consolidationTaskIds?: Set<string>
  onRefresh?: () => void
}

type PanelState =
  | { type: 'task'; id: string; title: string }
  | { type: 'pending'; id: string; title: string }
  | null

export function Priorities({ escalated, needsResponse, needsReplyTaskIds, overdueTasks, tasks, inboxTasks, overdueFollowUps, staleTracking, consolidationTaskIds, onRefresh }: Props) {
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const [panel, setPanel] = useState<PanelState>(null)

  const handleComplete = (id: string) => {
    setCompletedIds((prev) => new Set([...prev, id]))
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
            onComplete={handleComplete}
            onTaskClick={handleTaskClick}
            onRefresh={onRefresh}
          />
        </Section>
      )}

      {/* Overdue Follow-ups */}
      {overdueFollowUps.length > 0 && (
        <Section title="Overdue Follow-ups" icon="👁️" count={overdueFollowUps.length}>
          {overdueFollowUps
            .filter((t) => !completedIds.has(t.id))
            .map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                variant="escalated"
                hasConsolidation={consolidationTaskIds?.has(task.id)}
                onComplete={handleComplete}
                onClick={() => handleTaskClick(task)}
                onRefresh={onRefresh}
              />
            ))}
        </Section>
      )}

      {/* Stale Tracking Items */}
      {staleTracking.length > 0 && (
        <Section title="Stale tracking items" icon="👁️" count={staleTracking.length}>
          {staleTracking
            .filter((t) => !completedIds.has(t.id))
            .map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                variant="stale"
                hasConsolidation={consolidationTaskIds?.has(task.id)}
                onComplete={handleComplete}
                onClick={() => handleTaskClick(task)}
                onRefresh={onRefresh}
              />
            ))}
        </Section>
      )}

      {visibleEscalated.length === 0 &&
        needsResponse.length === 0 &&
        overdueTasks.length === 0 &&
        visibleTasks.length === 0 &&
        inboxTasks.length === 0 &&
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
  onComplete,
  onTaskClick,
  onRefresh,
}: {
  tasks: TaskWithEntities[]
  consolidationTaskIds?: Set<string>
  needsReplyTaskIds?: Set<string>
  onComplete: (id: string) => void
  onTaskClick: (task: TaskWithEntities) => void
  onRefresh?: () => void
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // Group by entry_id (tasks from same source email)
  const groups: Array<{ key: string; label: string; tasks: TaskWithEntities[] }> = []
  const byEntry = new Map<string, TaskWithEntities[]>()
  const noEntry: TaskWithEntities[] = []

  for (const task of tasks) {
    if (task.entry_id) {
      const existing = byEntry.get(task.entry_id) ?? []
      existing.push(task)
      byEntry.set(task.entry_id, existing)
    } else {
      noEntry.push(task)
    }
  }

  for (const [entryId, entryTasks] of byEntry) {
    groups.push({ key: entryId, label: getBrandLabel(entryTasks), tasks: entryTasks })
  }
  for (const task of noEntry) {
    groups.push({ key: task.id, label: '', tasks: [task] })
  }

  function getBrandLabel(tasks: TaskWithEntities[]): string {
    const brands = new Set(tasks.flatMap((t) => t.entities?.filter((e) => e.role === 'brand').map((e) => e.name) ?? []))
    return brands.size > 0 ? Array.from(brands).join(', ') : ''
  }

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="space-y-1">
      {groups.map(({ key, label, tasks: groupTasks }) => {
        if (groupTasks.length === 1) {
          // Single task — render normally
          return (
            <TaskRow
              key={groupTasks[0].id}
              task={groupTasks[0]}
              variant="normal"
              hasConsolidation={consolidationTaskIds?.has(groupTasks[0].id)}
              needsReply={needsReplyTaskIds?.has(groupTasks[0].id)}
              onComplete={onComplete}
              onClick={() => onTaskClick(groupTasks[0])}
              onRefresh={onRefresh}
            />
          )
        }

        // Multi-task group — collapsible
        const isExpanded = expandedGroups.has(key)
        const first = groupTasks[0]
        return (
          <div key={key} className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
            <button
              onClick={() => toggleGroup(key)}
              className="w-full flex items-center gap-3 py-3 px-4 text-left hover:bg-[var(--surface-hover)] transition-colors rounded-lg"
            >
              <span className="text-xs text-[var(--muted)] font-mono">{isExpanded ? '▼' : '▶'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--text)] truncate">{first.description}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {label && <span className="text-xs text-[var(--muted)]">{label}</span>}
                  <span className="text-xs text-[var(--muted)]">+{groupTasks.length - 1} related</span>
                </div>
              </div>
            </button>
            {isExpanded && (
              <div className="border-t border-[var(--border)] px-2 py-1 space-y-0.5">
                {groupTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    variant="normal"
                    hasConsolidation={consolidationTaskIds?.has(task.id)}
                    needsReply={needsReplyTaskIds?.has(task.id)}
                    onComplete={onComplete}
                    onClick={() => onTaskClick(task)}
                    onRefresh={onRefresh}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
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
  onComplete,
  onClick,
  onRefresh,
}: {
  task: TaskWithEntities
  variant: 'escalated' | 'normal' | 'stale'
  hasConsolidation?: boolean
  needsReply?: boolean
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
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base text-[var(--text)] leading-snug">
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
          {task.due_date && (
            <span className="text-xs text-[var(--muted)]">
              due {task.due_date}
            </span>
          )}
          {task.waiting_on && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
              ⏳ {task.waiting_on}
            </span>
          )}
          {task.status === 'tracking' && (
            <span className="inline-flex items-center gap-1 text-xs text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
              👁️ {task.tracked_owner ?? 'tracking'}
            </span>
          )}
          {task.status !== 'open' && task.status !== 'tracking' && (
            <StatusBadge status={task.status} />
          )}
        </div>
      </div>
    </div>
  )
}

function formatAge(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
