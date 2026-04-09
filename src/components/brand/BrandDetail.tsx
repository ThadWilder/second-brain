'use client'

import { useState } from 'react'
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

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'tasks', label: 'Tasks', count: localTasks.length },
    { key: 'entries', label: 'Entries', count: entries.length },
    { key: 'decisions', label: 'Decisions', count: decisions.length },
  ]

  return (
    <div className="space-y-4">
      {/* Brand header */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-100">{brand.name}</h1>
          <p className="text-sm text-slate-400 capitalize">{brand.type}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {openTasks.length} open
          </span>
          {openTasks.some((t) => t.escalation) && (
            <span className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded">
              escalated
            </span>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-[#2a2d3a]">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors
              ${activeTab === tab.key
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
          >
            {tab.label}
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
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Open</p>
              <div className="space-y-1">
                {openTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border
                      ${task.escalation
                        ? 'bg-red-500/5 border-red-500/10'
                        : 'bg-[#1a1d27] border-[#2a2d3a]'
                      }`}
                  >
                    <TaskCheckbox
                      taskId={task.id}
                      checked={false}
                      onComplete={handleComplete}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200">{task.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {task.due_date && (
                          <span className="text-xs text-slate-500">due {task.due_date}</span>
                        )}
                        {task.waiting_on && (
                          <span className="text-xs text-amber-400/70">waiting on {task.waiting_on}</span>
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
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Done</p>
              <div className="space-y-1 opacity-50">
                {doneTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-[#1a1d27] border border-[#2a2d3a]"
                  >
                    <span className="text-green-400 text-sm">✓</span>
                    <p className="text-sm text-slate-400 line-through">{task.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {localTasks.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-6">No tasks yet.</p>
          )}
        </div>
      )}

      {activeTab === 'entries' && (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="p-3 rounded-lg bg-[#1a1d27] border border-[#2a2d3a]"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-slate-500 uppercase">{entry.source}</span>
                <span className="text-xs text-slate-500">
                  {formatDate(entry.created_at)}
                </span>
              </div>
              <p className="text-sm text-slate-300 line-clamp-3 leading-relaxed">
                {entry.raw_text}
              </p>
            </div>
          ))}
          {entries.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-6">No entries yet.</p>
          )}
        </div>
      )}

      {activeTab === 'decisions' && (
        <div className="space-y-2">
          {decisions.map((decision) => (
            <div
              key={decision.id}
              className="p-3 rounded-lg bg-[#1a1d27] border border-[#2a2d3a]"
            >
              <p className="text-sm text-slate-200">{decision.summary}</p>
              <div className="flex items-center gap-2 mt-1">
                {decision.made_by && (
                  <span className="text-xs text-slate-500">by {decision.made_by}</span>
                )}
                <span className="text-xs text-slate-500">{formatDate(decision.created_at)}</span>
              </div>
            </div>
          ))}
          {decisions.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-6">No decisions logged yet.</p>
          )}
        </div>
      )}

      {/* Entity graph */}
      {entities.length > 0 && (
        <div className="pt-4 border-t border-[#2a2d3a]">
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
