'use client'

import { useState } from 'react'
import { TaskCheckbox } from '@/components/ui/TaskCheckbox'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { TaskWithEntities } from '@/types'

interface Props {
  escalated: TaskWithEntities[]
  needsResponse: Array<{ id: string; summary: string; created_at: string }>
  tasks: TaskWithEntities[]
  staleFromYesterday: TaskWithEntities[]
}

export function Priorities({ escalated, needsResponse, tasks, staleFromYesterday }: Props) {
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())

  const handleComplete = (id: string) => {
    setCompletedIds((prev) => new Set([...prev, id]))
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
              onComplete={handleComplete}
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
              className="flex items-start gap-3 py-2 px-3 rounded-lg bg-amber-500/5 border border-amber-500/10"
            >
              <span className="text-amber-400 shrink-0 mt-0.5">›</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-300">{pr.summary}</p>
                <p className="text-xs text-slate-500 mt-0.5">
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
              onComplete={handleComplete}
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
                onComplete={handleComplete}
              />
            ))}
        </Section>
      )}

      {visibleEscalated.length === 0 &&
        needsResponse.length === 0 &&
        visibleTasks.length === 0 &&
        staleFromYesterday.length === 0 && (
          <div className="text-center py-8 text-slate-500 text-sm">
            All clear. No open items.
          </div>
        )}
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
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {title}
        </h3>
        <span className="text-xs text-slate-500 ml-1">({count})</span>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function TaskRow({
  task,
  variant,
  onComplete,
}: {
  task: TaskWithEntities
  variant: 'escalated' | 'normal' | 'stale'
  onComplete: (id: string) => void
}) {
  const brand = task.entities?.find((e) => e.role === 'brand')

  const variantStyles = {
    escalated: 'bg-red-500/5 border-red-500/10',
    normal: 'bg-[#1a1d27] border-[#2a2d3a]',
    stale: 'bg-[#1a1d27] border-[#2a2d3a] opacity-75',
  }

  return (
    <div
      className={`flex items-start gap-3 py-2 px-3 rounded-lg border ${variantStyles[variant]}`}
    >
      <TaskCheckbox
        taskId={task.id}
        checked={task.status === 'done'}
        onComplete={onComplete}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 leading-snug">{task.description}</p>
        <div className="flex items-center gap-2 mt-1">
          {brand && (
            <span className="text-xs text-slate-400">{brand.name}</span>
          )}
          {task.due_date && (
            <span className="text-xs text-slate-500">
              due {task.due_date}
            </span>
          )}
          {task.waiting_on && (
            <span className="text-xs text-amber-400/70">
              waiting on {task.waiting_on}
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
