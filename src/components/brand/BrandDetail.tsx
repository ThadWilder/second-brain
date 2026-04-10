'use client'

import { useState } from 'react'
import { ListTodo, FileText, Scale } from 'lucide-react'
import { TaskCheckbox } from '@/components/ui/TaskCheckbox'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EntityList } from './EntityList'
import type { Entity, Task, Decision, Entry } from '@/types'

interface Props {
  brand: Entity
  tasks: Task[]
  decisions: Decision[]
  entries: Entry[]
  entities: Entity[]
}

type Tab = 'tasks' | 'entries' | 'decisions'

export function BrandDetail({ brand, tasks, decisions, entries, entities }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('tasks')
  const [localTasks, setLocalTasks] = useState(tasks)

  const handleComplete = (id: string) => {
    setLocalTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: 'done' as const, resolved_at: new Date().toISOString() } : t))
    )
  }

  const openTasks = localTasks.filter((t) => t.status === 'open' || t.status === 'blocked')
  const doneTasks = localTasks.filter((t) => t.status === 'done')

  const TABS: { key: Tab; label: string; count: number; icon: React.ReactNode }[] = [
    { key: 'tasks', label: 'Tasks', count: localTasks.length, icon: <ListTodo className="w-3.5 h-3.5" /> },
    { key: 'entries', label: 'Dumplings', count: entries.length, icon: <FileText className="w-3.5 h-3.5" /> },
    { key: 'decisions', label: 'Decisions', count: decisions.length, icon: <Scale className="w-3.5 h-3.5" /> },
  ]

  return (
    <div className="space-y-4">
      {/* Brand header */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">{brand.name}</h1>
          <p className="text-sm text-[var(--muted)] capitalize">{brand.type}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-[var(--muted)]">
            {openTasks.length} open
          </span>
          {openTasks.some((t) => t.escalation) && (
            <span className="text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded">
              escalated
            </span>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-[var(--border)]">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors
              ${activeTab === tab.key
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
              }`}
          >
            <span className="inline-flex items-center gap-1">
              {tab.icon}
              {tab.label}
            </span>
            <span className="ml-1.5 text-xs opacity-60">({tab.count})</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'tasks' && (
        <div className="space-y-3">
          {/* Open tasks */}
          {openTasks.length > 0 && (
            <div>
              <p className="text-xs text-[var(--muted)] uppercase tracking-wide mb-2">Open</p>
              <div className="space-y-1">
                {openTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border
                      ${task.escalation
                        ? 'bg-red-50 border-red-200'
                        : 'bg-[var(--surface)] border-[var(--border)]'
                      }`}
                  >
                    <TaskCheckbox
                      taskId={task.id}
                      checked={false}
                      onComplete={handleComplete}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--text)]">{task.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {task.due_date && (
                          <span className="text-xs text-[var(--muted)]">due {task.due_date}</span>
                        )}
                        {task.waiting_on && (
                          <span className="text-xs text-amber-700">waiting on {task.waiting_on}</span>
                        )}
                        <StatusBadge status={task.status} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Closed tasks */}
          {doneTasks.length > 0 && (
            <div>
              <p className="text-xs text-[var(--muted)] uppercase tracking-wide mb-2">Done</p>
              <div className="space-y-1 opacity-50">
                {doneTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]"
                  >
                    <span className="text-green-700 text-sm">✓</span>
                    <p className="text-sm text-[var(--muted)] line-through">{task.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {localTasks.length === 0 && (
            <p className="text-sm text-[var(--muted)] text-center py-6">📋 No tasks yet.</p>
          )}
        </div>
      )}

      {activeTab === 'entries' && (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-[var(--muted)] uppercase">{entry.source}</span>
                <span className="text-xs text-[var(--muted)]">
                  {formatDate(entry.created_at)}
                </span>
              </div>
              <p className="text-sm text-[var(--text)] line-clamp-3 leading-relaxed">
                {entry.raw_text}
              </p>
            </div>
          ))}
          {entries.length === 0 && (
            <p className="text-sm text-[var(--muted)] text-center py-6">🥟 No dumplings yet. Dump something!</p>
          )}
        </div>
      )}

      {activeTab === 'decisions' && (
        <div className="space-y-2">
          {decisions.map((decision) => (
            <div
              key={decision.id}
              className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]"
            >
              <p className="text-sm text-[var(--text)]">{decision.summary}</p>
              <div className="flex items-center gap-2 mt-1">
                {decision.made_by && (
                  <span className="text-xs text-[var(--muted)]">by {decision.made_by}</span>
                )}
                <span className="text-xs text-[var(--muted)]">{formatDate(decision.created_at)}</span>
              </div>
            </div>
          ))}
          {decisions.length === 0 && (
            <p className="text-sm text-[var(--muted)] text-center py-6">No decisions logged yet. They&apos;ll show up as you go.</p>
          )}
        </div>
      )}

      {/* Entity graph */}
      {entities.length > 0 && (
        <div className="pt-4 border-t border-[var(--border)]">
          <EntityList entities={entities} title="Linked Entities" />
        </div>
      )}
    </div>
  )
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
