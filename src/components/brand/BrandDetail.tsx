'use client'

import { useState } from 'react'
import { ListTodo, FileText, Scale, GitMerge } from 'lucide-react'
import { TaskCheckbox } from '@/components/ui/TaskCheckbox'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EntityList } from './EntityList'
import { CombineTasksModal } from './CombineTasksModal'
import { AutoLinkText } from '@/components/ui/AutoLinkText'
import { LinkChips } from '@/components/ui/LinkChips'
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
  const [combineMode, setCombineMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showCombineModal, setShowCombineModal] = useState(false)

  const handleComplete = (id: string) => {
    setLocalTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: 'done' as const, resolved_at: new Date().toISOString() } : t))
    )
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const exitCombineMode = () => {
    setCombineMode(false)
    setSelectedIds(new Set())
  }

  const handleCombined = (newTask: Task) => {
    setLocalTasks((prev) => [
      newTask,
      ...prev.map((t) =>
        selectedIds.has(t.id) ? { ...t, status: 'done' as const, resolved_at: new Date().toISOString() } : t
      ),
    ])
    setShowCombineModal(false)
    exitCombineMode()
  }

  const allOpen = localTasks.filter((t) => t.status === 'open' || t.status === 'blocked')
  const openTasks = allOpen.filter((t) => !t.waiting_on)
  const waitingOnTasks = allOpen.filter((t) => t.waiting_on)
  const trackingTasks = localTasks.filter((t) => t.status === 'tracking')
  const doneTasks = localTasks.filter((t) => t.status === 'done')
  const selectedTasks = allOpen.filter((t) => selectedIds.has(t.id))
  const [trackingExpanded, setTrackingExpanded] = useState(false)

  const TABS: { key: Tab; label: string; count: number; icon: React.ReactNode }[] = [
    { key: 'tasks', label: 'Tasks', count: localTasks.length, icon: <ListTodo className="w-3.5 h-3.5" /> },
    { key: 'entries', label: 'Dumplings', count: entries.length, icon: <FileText className="w-3.5 h-3.5" /> },
    { key: 'decisions', label: 'Decisions', count: decisions.length, icon: <Scale className="w-3.5 h-3.5" /> },
  ]

  return (
    <div className="space-y-5">
      {/* Brand header */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">{brand.name}</h1>
          <p className="text-base text-[var(--muted)] capitalize">{brand.type}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-[var(--muted)]">
            {allOpen.length} open
          </span>
          {allOpen.some((t) => t.escalation) && (
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
            className={`px-4 py-2.5 text-base font-medium border-b-2 transition-colors
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
        <div className="space-y-4">
          {/* Open tasks */}
          {openTasks.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-[var(--muted)] uppercase tracking-wide">Open</p>
                {allOpen.length >= 2 && (
                  <button
                    onClick={combineMode ? exitCombineMode : () => setCombineMode(true)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md border transition-colors
                      ${combineMode
                        ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                        : 'text-[var(--muted)] border-[var(--border)] hover:text-[var(--text)] hover:border-[var(--accent)]'
                      }`}
                    title={combineMode ? 'Exit combine mode' : 'Combine tasks'}
                  >
                    <GitMerge className="w-3 h-3" />
                    {combineMode ? 'Cancel' : 'Combine'}
                  </button>
                )}
              </div>
              <div className="space-y-1">
                {openTasks.map((task) => {
                  const isSelected = selectedIds.has(task.id)
                  return (
                    <div
                      key={task.id}
                      onClick={combineMode ? () => toggleSelect(task.id) : undefined}
                      className={`flex items-start gap-3 p-4 rounded-lg border transition-colors
                        ${combineMode ? 'cursor-pointer' : ''}
                        ${isSelected
                          ? 'bg-amber-50 border-[var(--accent)] ring-1 ring-[var(--accent)]'
                          : task.escalation
                            ? 'bg-red-50 border-red-200'
                            : 'bg-[var(--surface)] border-[var(--border)]'
                        }`}
                    >
                      {combineMode ? (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(task.id)}
                          className="mt-0.5 accent-[var(--accent)]"
                        />
                      ) : (
                        <TaskCheckbox
                          taskId={task.id}
                          checked={false}
                          onComplete={handleComplete}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-base text-[var(--text)]">
                          <AutoLinkText text={task.description} />
                        </p>
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
                  )
                })}
              </div>

              {/* Combine action bar */}
              {combineMode && selectedIds.size >= 2 && (
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={() => setShowCombineModal(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg
                               bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
                  >
                    <GitMerge className="w-3.5 h-3.5" />
                    Combine {selectedIds.size} tasks
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Waiting On tasks */}
          {waitingOnTasks.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-sm text-[var(--muted)] uppercase tracking-wide">
                  Waiting On
                </p>
                <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">
                  {waitingOnTasks.length}
                </span>
              </div>
              <div className="space-y-1">
                {waitingOnTasks.map((task) => {
                  const isSelected = selectedIds.has(task.id)
                  return (
                    <div
                      key={task.id}
                      onClick={combineMode ? () => toggleSelect(task.id) : undefined}
                      className={`flex items-start gap-3 p-4 rounded-lg border transition-colors
                        ${combineMode ? 'cursor-pointer' : ''}
                        ${isSelected
                          ? 'bg-amber-50 border-[var(--accent)] ring-1 ring-[var(--accent)]'
                          : 'bg-amber-50/50 border-amber-200'
                        }`}
                    >
                      {combineMode ? (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(task.id)}
                          className="mt-0.5 accent-[var(--accent)]"
                        />
                      ) : (
                        <TaskCheckbox
                          taskId={task.id}
                          checked={false}
                          onComplete={handleComplete}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-base text-[var(--text)]">
                          <AutoLinkText text={task.description} />
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                            ⏳ {task.waiting_on}
                          </span>
                          {task.due_date && (
                            <span className="text-xs text-[var(--muted)]">due {task.due_date}</span>
                          )}
                          <StatusBadge status={task.status} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* On Your Radar — tracking tasks */}
          {trackingTasks.length > 0 && (
            <div>
              <button
                onClick={() => setTrackingExpanded(!trackingExpanded)}
                className="flex items-center gap-2 mb-2 w-full text-left"
              >
                <p className="text-sm text-[var(--muted)] uppercase tracking-wide">
                  On Your Radar 👁️
                </p>
                <span className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded-full">
                  {trackingTasks.length}
                </span>
                <span className="text-xs text-[var(--muted)] ml-auto">
                  {trackingExpanded ? '▾' : '▸'}
                </span>
              </button>
              {trackingExpanded && (
                <div className="space-y-1">
                  {trackingTasks
                    .sort((a, b) => {
                      // Overdue items first
                      const today = new Date().toISOString().slice(0, 10)
                      const aOverdue = a.follow_up_date && a.follow_up_date <= today ? 0 : 1
                      const bOverdue = b.follow_up_date && b.follow_up_date <= today ? 0 : 1
                      return aOverdue - bOverdue
                    })
                    .map((task) => {
                      const today = new Date().toISOString().slice(0, 10)
                      const isOverdue = task.follow_up_date && task.follow_up_date <= today
                      const daysSinceUpdate = Math.floor(
                        (Date.now() - new Date(task.updated_at).getTime()) / (1000 * 60 * 60 * 24)
                      )
                      return (
                        <div
                          key={task.id}
                          className={`flex items-start gap-3 p-4 rounded-lg border transition-colors ${
                            isOverdue
                              ? 'bg-red-50/50 border-l-[3px] border-l-red-400 border-red-200'
                              : 'bg-purple-50/50 border-purple-200'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-[var(--text)]">
                              <AutoLinkText text={task.description} />
                            </p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {task.tracked_owner && (
                                <span className="inline-flex items-center gap-1 text-xs text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
                                  👤 {task.tracked_owner}
                                </span>
                              )}
                              {task.follow_up_date && (
                                <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${
                                  isOverdue
                                    ? 'text-red-700 bg-red-100 font-medium'
                                    : 'text-[var(--muted)] bg-[var(--bg)]'
                                }`}>
                                  📅 {new Date(task.follow_up_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  {isOverdue && <span className="text-red-600 font-medium ml-1">overdue</span>}
                                </span>
                              )}
                              {daysSinceUpdate > 0 && (
                                <span className="text-[10px] text-[var(--muted)]">
                                  updated {daysSinceUpdate}d ago
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          )}

          {/* Closed tasks */}
          {doneTasks.length > 0 && (
            <div>
              <p className="text-sm text-[var(--muted)] uppercase tracking-wide mb-2">Plated</p>
              <div className="space-y-1 opacity-50">
                {doneTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 p-4 rounded-lg bg-[var(--surface)] border border-[var(--border)]"
                  >
                    <span className="text-green-700 text-sm">✓</span>
                    <p className="text-sm text-[var(--muted)] line-through">
                      <AutoLinkText text={task.description} />
                    </p>
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
              className="p-4 rounded-lg bg-[var(--surface)] border border-[var(--border)]"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-[var(--muted)] uppercase">{entry.source}</span>
                <span className="text-xs text-[var(--muted)]">
                  {formatDate(entry.created_at)}
                </span>
              </div>
              <p className="text-sm text-[var(--text)] line-clamp-3 leading-relaxed">
                <AutoLinkText text={entry.raw_text} />
              </p>
              <LinkChips links={entry.links ?? []} />
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
              className="p-4 rounded-lg bg-[var(--surface)] border border-[var(--border)]"
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

      {/* Combine tasks modal */}
      {showCombineModal && selectedTasks.length >= 2 && (
        <CombineTasksModal
          tasks={selectedTasks}
          brandId={brand.id}
          onClose={() => setShowCombineModal(false)}
          onCombined={handleCombined}
        />
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
