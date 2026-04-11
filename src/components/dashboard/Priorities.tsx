'use client'

import { useState, useCallback, useRef } from 'react'
import { Hourglass, X } from 'lucide-react'
import { TaskCheckbox } from '@/components/ui/TaskCheckbox'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DetailPanel } from './DetailPanel'
import { TaskDetail } from './TaskDetail'
import { PendingResponseDetail } from './PendingResponseDetail'
import type { TaskWithEntities } from '@/types'

interface Props {
  escalated: TaskWithEntities[]
  needsResponse: Array<{ id: string; summary: string; created_at: string }>
  tasks: TaskWithEntities[]
  staleFromYesterday: TaskWithEntities[]
  consolidationTaskIds?: Set<string>
  onRefresh?: () => void
}

type PanelState =
  | { type: 'task'; id: string; title: string }
  | { type: 'pending'; id: string; title: string }
  | null

export function Priorities({ escalated, needsResponse, tasks, staleFromYesterday, consolidationTaskIds, onRefresh }: Props) {
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
        <Section title="Escalations" icon="🔥" count={visibleEscalated.length}>
          {visibleEscalated.map((task) => (
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

      {/* Needs Response */}
      {needsResponse.length > 0 && (
        <Section title="Needs Response" icon="📬" count={needsResponse.length}>
          {needsResponse.map((pr) => (
            <div
              key={pr.id}
              onClick={() => handlePendingClick(pr)}
              className="flex items-start gap-3 py-2 px-3 rounded-lg bg-amber-50 border border-amber-200 cursor-pointer hover:bg-amber-100 transition-colors"
            >
              <span className="text-amber-700 shrink-0 mt-0.5">›</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--text)]">{pr.summary}</p>
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
              onComplete={handleComplete}
              onClick={() => handleTaskClick(task)}
              onRefresh={onRefresh}
            />
          ))}
        </Section>
      )}

      {/* Still open from yesterday */}
      {staleFromYesterday.length > 0 && (
        <Section title="Still open from yesterday" icon="⏳" count={staleFromYesterday.length}>
          {staleFromYesterday
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
        visibleTasks.length === 0 &&
        staleFromYesterday.length === 0 && (
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

function Section({
  title,
  icon,
  count,
  children,
}: {
  title: string
  icon: string
  count: number
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">{icon}</span>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          {title}
        </h3>
        <span className="text-xs text-[var(--muted)] ml-1">({count})</span>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function TaskRow({
  task,
  variant,
  hasConsolidation,
  onComplete,
  onClick,
  onRefresh,
}: {
  task: TaskWithEntities
  variant: 'escalated' | 'normal' | 'stale'
  hasConsolidation?: boolean
  onComplete: (id: string) => void
  onClick: () => void
  onRefresh?: () => void
}) {
  const brand = task.entities?.find((e) => e.role === 'brand')
  const [showWaitingPopover, setShowWaitingPopover] = useState(false)
  const [waitingInput, setWaitingInput] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

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

  const variantStyles = {
    escalated: 'bg-red-50 border-red-200',
    normal: 'bg-[var(--surface)] border-[var(--border)]',
    stale: 'bg-[var(--surface)] border-[var(--border)] opacity-75',
  }

  return (
    <div
      className={`group flex items-start gap-3 py-2 px-3 rounded-lg border cursor-pointer hover:shadow-sm transition-shadow ${variantStyles[variant]}`}
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
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--text)] leading-snug">{task.description}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
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
          {task.status !== 'open' && (
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
