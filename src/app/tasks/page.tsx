'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Header } from '@/components/ui/Header'
import { Priorities } from '@/components/dashboard/Priorities'
import { useToast, ToastProvider } from '@/components/ui/Toast'
import { DetailPanel } from '@/components/dashboard/DetailPanel'
import { TaskDetail } from '@/components/dashboard/TaskDetail'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { AutoLinkText } from '@/components/ui/AutoLinkText'
import { FolderOpen } from 'lucide-react'

const POLL_INTERVAL = 60_000

type ViewMode = 'status' | 'project' | 'due_date'

function TasksContent() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('status')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['_all']))
  const { showToast } = useToast()

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard?t=${Date.now()}`)
      if (res.ok) {
        setData(await res.json())
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchData])

  useEffect(() => {
    const handleFocus = () => fetchData()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [fetchData])

  const allTasks = useMemo(() => {
    if (!data) return []
    const {
      escalatedTasks = [], overdueTasks = [], regularTasks = [], backlogTasks = [],
      watchingTasks = [], overdueFollowUps = [], staleTracking = [],
    } = data
    // Merge and dedupe all tasks
    const seen = new Set<string>()
    const merged: any[] = []
    for (const t of [...escalatedTasks, ...overdueTasks, ...regularTasks, ...backlogTasks, ...watchingTasks, ...overdueFollowUps, ...staleTracking]) {
      if (!seen.has(t.id)) {
        seen.add(t.id)
        merged.push(t)
      }
    }
    return merged
  }, [data])

  const grouped = useMemo(() => {
    if (viewMode === 'status') return null // use Priorities component

    const groups: Array<{ key: string; label: string; tasks: any[] }> = []
    const map = new Map<string, any[]>()

    for (const task of allTasks) {
      let key: string
      let label: string

      if (viewMode === 'project') {
        const proj = task.entities?.find((e: any) => e.role === 'project')
        key = proj?.name ?? '_none'
        label = proj?.name ?? 'No Project'
      } else {
        // due_date
        if (!task.due_date) {
          key = '_none'
          label = 'No Due Date'
        } else {
          key = task.due_date
          label = new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        }
      }

      const existing = map.get(key) ?? []
      existing.push(task)
      map.set(key, existing)
    }

    const sorted = Array.from(map.entries()).sort((a, b) => {
      if (a[0] === '_none') return 1
      if (b[0] === '_none') return -1
      return a[0].localeCompare(b[0])
    })

    for (const [key, tasks] of sorted) {
      groups.push({ key, label: key === '_none' ? (viewMode === 'project' ? 'No Project' : 'No Due Date') : sorted.find(s => s[0] === key) ? Array.from(map.entries()).find(s => s[0] === key)?.[0] === key ? groups.length === groups.length ? '' : '' : '' : '', tasks })
    }

    // Rebuild cleanly
    return sorted.map(([key, tasks]) => ({
      key,
      label: key === '_none'
        ? (viewMode === 'project' ? 'No Project' : 'No Due Date')
        : viewMode === 'due_date'
          ? new Date(key + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          : key,
      tasks,
    }))
  }, [allTasks, viewMode])

  function toggleGroup(key: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-[var(--muted)]">Loading tasks...</p>
      </div>
    )
  }

  const {
    escalatedTasks = [], overdueTasks = [], regularTasks = [], backlogTasks = [],
    watchingTasks = [], overdueFollowUps = [], staleTracking = [],
    pendingResponses = [], needsReplyTaskIds = [],
    consolidationTaskIds = [], commentCounts = {},
    brands = [],
  } = data

  return (
    <>
      {/* View toggle */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-[var(--muted)]">View:</span>
        {(['status', 'project', 'due_date'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => { setViewMode(mode); setExpandedGroups(new Set()) }}
            className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
              viewMode === mode
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'bg-[var(--surface)] text-[var(--text)] border-[var(--border)] hover:bg-[var(--surface-hover)]'
            }`}
          >
            {mode === 'status' ? 'By Status' : mode === 'project' ? 'By Project' : 'By Due Date'}
          </button>
        ))}
      </div>

      {viewMode === 'status' ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 shadow-sm">
          <Priorities
            escalated={escalatedTasks}
            needsResponse={pendingResponses}
            needsReplyTaskIds={new Set(needsReplyTaskIds)}
            overdueTasks={overdueTasks}
            tasks={regularTasks}
            inboxTasks={[]}
            backlogTasks={backlogTasks}
            watchingTasks={watchingTasks}
            overdueFollowUps={overdueFollowUps}
            staleTracking={staleTracking}
            consolidationTaskIds={new Set(consolidationTaskIds)}
            commentCounts={commentCounts}
            brands={brands}
            onRefresh={fetchData}
          />
        </div>
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 shadow-sm space-y-2">
          {grouped?.map(({ key, label, tasks }) => {
            const isExpanded = expandedGroups.has(key)
            return (
              <div key={key}>
                <button
                  onClick={() => toggleGroup(key)}
                  className="w-full flex items-center gap-2 py-2 px-1 text-left hover:bg-[var(--surface-hover)] transition-colors rounded"
                >
                  <span className="text-sm text-[var(--muted)] font-mono">{isExpanded ? '▼' : '▶'}</span>
                  {viewMode === 'project' && key !== '_none' && <FolderOpen size={14} className="text-amber-600" />}
                  <span className="text-base font-semibold text-[var(--text)]">{label}</span>
                  <span className="text-sm text-[var(--muted)]">{tasks.length}</span>
                </button>
                {isExpanded && (
                  <div className="ml-3 border-l-2 border-[var(--border)] pl-2 space-y-1">
                    {tasks.map((task: any) => (
                      <div
                        key={task.id}
                        onClick={() => setSelectedTaskId(task.id)}
                        className="group flex items-start gap-3 py-3 px-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] cursor-pointer hover:shadow-sm transition-shadow"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[var(--text)] leading-snug">
                            <AutoLinkText text={task.description} />
                          </p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {task.escalation && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 font-medium">Escalated</span>}
                            <StatusBadge status={task.status} />
                            {task.entities?.filter((e: any) => e.role === 'brand').map((e: any) => (
                              <span key={e.id} className="text-xs text-[var(--muted)]">{e.name}</span>
                            ))}
                            {task.entities?.filter((e: any) => e.role === 'project').map((e: any) => (
                              <span key={e.id} className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium flex items-center gap-0.5">
                                <FolderOpen size={10} />{e.name}
                              </span>
                            ))}
                            {task.due_date && (
                              <span className="text-xs text-[var(--muted)]">
                                due {new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                            {task.waiting_on && (
                              <span className="text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                Waiting: {task.waiting_on}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {(grouped?.length ?? 0) === 0 && (
            <p className="text-sm text-[var(--muted)] py-4 text-center">No tasks.</p>
          )}
        </div>
      )}

      {/* Task detail panel */}
      <DetailPanel
        open={selectedTaskId !== null}
        onClose={() => setSelectedTaskId(null)}
        title="Task Detail"
      >
        {selectedTaskId && (
          <TaskDetail taskId={selectedTaskId} onUpdate={() => { fetchData() }} />
        )}
      </DetailPanel>
    </>
  )
}

export default function TasksPage() {
  return (
    <ToastProvider>
      <div className="min-h-screen flex flex-col">
        <Header activePage="tasks" />
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[1100px] mx-auto px-4 py-8 space-y-6">
            <h1 className="text-xl font-bold text-[var(--text)]">Tasks</h1>
            <TasksContent />
          </div>
        </div>
      </div>
    </ToastProvider>
  )
}
