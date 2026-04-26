'use client'

import { useState, useEffect, useRef } from 'react'
import { Clock, Users, FileText, AlertTriangle, Loader2, GitMerge, Hourglass, X, Eye, ArrowLeft, CheckCircle2, Ban, Tag, Plus, Globe, MessageSquare, Check, FolderOpen } from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useToast } from '@/components/ui/Toast'
import { AutoLinkText } from '@/components/ui/AutoLinkText'
import type { TaskStatus, EventType } from '@/types'

interface ConsolidationSuggestion {
  id: string
  direction: 'new' | 'existing'
  other_task_id: string
  other_task_description: string | null
  merged_description: string
  reason: string
  created_at: string
}

interface TaskData {
  task: {
    id: string
    description: string
    status: TaskStatus
    escalation: boolean
    due_date: string | null
    waiting_on: string | null
    tracked_owner: string | null
    follow_up_date: string | null
    entry_id: string | null
    public: boolean
    tags: string[]
    created_at: string
    updated_at: string
  }
  entities: Array<{ id: string; name: string; type: string; role: string }>
  events: Array<{ id: string; event_type: EventType; metadata: Record<string, unknown> | null; created_at: string }>
  source_entry: { id: string; raw_text: string; source: string; created_at: string } | null
  consolidation_suggestions: ConsolidationSuggestion[]
}

export function TaskDetail({ taskId, onUpdate }: { taskId: string; onUpdate?: () => void }) {
  const [data, setData] = useState<TaskData | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null)
  const [allEntities, setAllEntities] = useState<Array<{ id: string; name: string; type: string }>>([])
  const [linkingEntity, setLinkingEntity] = useState(false)
  const [resolvingConsolidation, setResolvingConsolidation] = useState<string | null>(null)
  const [showTrackingSetup, setShowTrackingSetup] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editingDescription, setEditingDescription] = useState(false)
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [waitingOnInput, setWaitingOnInput] = useState('')
  const [savingWaitingOn, setSavingWaitingOn] = useState(false)
  const [editingDueDate, setEditingDueDate] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [showTagInput, setShowTagInput] = useState(false)
  const [allTags, setAllTags] = useState<string[]>([])
  const [comments, setComments] = useState<Array<{ id: string; author_name: string; author_email: string | null; content: string; is_resolved: boolean; created_at: string }>>([])
  const [loadingComments, setLoadingComments] = useState(false)
  const tagInputRef = useRef<HTMLInputElement>(null)
  const waitingInputRef = useRef<HTMLInputElement>(null)
  const { showToast } = useToast()

  async function loadData() {
    const r = await fetch(`/api/tasks/${taskId}`)
    setData(await r.json())
  }

  async function loadComments() {
    setLoadingComments(true)
    try {
      const r = await fetch(`/api/tasks/${taskId}/comments`)
      if (r.ok) {
        const d = await r.json()
        setComments(d.comments ?? [])
      }
    } finally {
      setLoadingComments(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    loadData().finally(() => setLoading(false))
    loadComments()
    // Fetch all entities for linking
    fetch('/api/dashboard').then(r => r.json()).then(d => {
      setAllEntities(d.allEntities ?? [])
    }).catch(() => {})
    // Fetch all tags for autocomplete
    fetch('/api/tags').then(r => r.json()).then(d => {
      setAllTags((d.tags ?? []).map((t: { tag: string }) => t.tag))
    }).catch(() => {})
  }, [taskId])

  async function linkEntity(entityId: string) {
    setLinkingEntity(true)
    try {
      const entity = allEntities.find(e => e.id === entityId)
      const role = entity?.type === 'project' ? 'project' : entity && ['brand', 'department'].includes(entity.type) ? 'brand' : 'related'
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link_entity_id: entityId, link_role: role }),
      })
      // Optimistic update: add entity to local state immediately
      if (entity && data) {
        setData({
          ...data,
          entities: [...data.entities, { id: entity.id, name: entity.name, type: entity.type, role: 'related' }],
        })
      }
      showFeedback('Entity linked ✓')
    } finally {
      setLinkingEntity(false)
    }
  }

  async function unlinkEntity(entityId: string) {
    if (!data) return
    // Optimistic update: remove entity from local state immediately
    const prev = data.entities
    setData({ ...data, entities: data.entities.filter(e => e.id !== entityId) })
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_id: entityId }),
      })
      showFeedback('Entity unlinked ✓')
    } catch {
      // Revert on failure
      setData(d => d ? { ...d, entities: prev } : d)
    }
  }

  async function resolveConsolidation(suggestionId: string, action: 'accept' | 'dismiss') {
    setResolvingConsolidation(suggestionId)
    try {
      const res = await fetch('/api/consolidation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestion_id: suggestionId, action }),
      })
      if (res.ok) {
        await loadData()
        showFeedback(action === 'accept' ? 'Tasks merged ✓' : 'Suggestion dismissed ✓')
        onUpdate?.()
      }
    } finally {
      setResolvingConsolidation(null)
    }
  }

  function showFeedback(msg: string) {
    setSavedFeedback(msg)
    setTimeout(() => setSavedFeedback(null), 2000)
  }

  const waitingOnSuggestions = waitingOnInput.trim().length > 0
    ? allEntities
        .filter((e) =>
          ['contact', 'vendor', 'franchisee', 'freelancer', 'vendor_team', 'brand', 'department'].includes(e.type) &&
          e.name.toLowerCase().includes(waitingOnInput.toLowerCase())
        )
        .slice(0, 6)
    : []

  async function saveWaitingOn(value: string) {
    setSavingWaitingOn(true)
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, waiting_on: value || null }),
      })
      setEditing(false)
      setWaitingOnInput('')
      await loadData()
      showFeedback('Updated ✓')
      onUpdate?.()
    } finally {
      setSavingWaitingOn(false)
    }
  }

  async function updateTask(updates: Record<string, unknown>) {
    setUpdating(true)
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, ...updates }),
    })
    await loadData()
    setUpdating(false)

    if (updates.status === 'done' || updates.status === 'dismissed') {
      const label = updates.status === 'done' ? 'Plated ✓' : 'Dismissed'
      showToast({
        message: label,
        type: 'success',
        action: {
          label: 'Undo',
          onClick: () => {
            fetch('/api/tasks', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: taskId, status: 'open' }),
            }).then(() => {
              loadData()
              onUpdate?.()
            })
          },
        },
      })
    } else {
      showFeedback(updates.status === 'closed' ? 'Task closed ✓' : 'Updated ✓')
    }
    onUpdate?.()
  }

  async function addTag(tag: string) {
    const normalized = tag.toLowerCase().trim()
    if (!normalized || !data) return
    const currentTags = data.task.tags ?? []
    if (currentTags.includes(normalized)) return
    const newTags = [...currentTags, normalized]
    // Optimistic update
    setData({ ...data, task: { ...data.task, tags: newTags } })
    setTagInput('')
    setShowTagInput(false)
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, tags: newTags }),
    })
    // Update allTags if this is a new tag
    if (!allTags.includes(normalized)) {
      setAllTags(prev => [...prev, normalized].sort())
    }
    showFeedback('Tag added ✓')
    onUpdate?.()
  }

  async function removeTag(tag: string) {
    if (!data) return
    const currentTags = data.task.tags ?? []
    const newTags = currentTags.filter(t => t !== tag)
    // Optimistic update
    setData({ ...data, task: { ...data.task, tags: newTags } })
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, tags: newTags }),
    })
    showFeedback('Tag removed ✓')
    onUpdate?.()
  }

  const tagSuggestions = tagInput.trim().length > 0
    ? allTags
        .filter(t => t.includes(tagInput.toLowerCase().trim()) && !(data?.task.tags ?? []).includes(t))
        .slice(0, 6)
    : []

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 text-[var(--muted)] animate-spin" />
      </div>
    )
  }

  if (!data?.task) {
    return <p className="text-sm text-[var(--muted)] py-8 text-center">Task not found.</p>
  }

  const { task, entities, events, source_entry, consolidation_suggestions } = data

  return (
    <div className="space-y-5">
      {/* Feedback banner */}
      {savedFeedback && (
        <div className="bg-green-50 text-green-700 text-xs font-medium px-3 py-2 rounded-lg text-center animate-pulse">
          {savedFeedback}
        </div>
      )}

      {/* Project */}
      <div className="flex items-center gap-2">
        {entities.filter(e => e.role === 'project').map(e => (
          <a
            key={e.id}
            href={`/projects/${e.id}`}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 font-medium hover:bg-amber-100 transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            {e.name}
          </a>
        ))}
        {entities.filter(e => e.role === 'project').length === 0 && (
          <select
            className="text-xs px-2 py-1 rounded border border-dashed border-[var(--border)] bg-transparent text-[var(--muted)] cursor-pointer hover:border-[var(--accent)] focus:border-[var(--accent)] focus:outline-none"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                linkEntity(e.target.value)
                e.target.value = ''
              }
            }}
          >
            <option value="" disabled>+ Add to project...</option>
            {allEntities.filter(e => e.type === 'project').map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Description */}
      <div>
        {editingDescription ? (
          <div className="space-y-2">
            <textarea
              autoFocus
              value={descriptionDraft}
              onChange={(e) => setDescriptionDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditingDescription(false)
              }}
              rows={3}
              className="w-full text-base text-[var(--text)] leading-relaxed bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--accent)] resize-none"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  if (descriptionDraft.trim() && descriptionDraft.trim() !== task.description) {
                    await fetch(`/api/tasks/${taskId}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ add_note: `Description updated from: ${task.description}` }),
                    })
                    await updateTask({ description: descriptionDraft.trim() })
                  }
                  setEditingDescription(false)
                }}
                className="px-2.5 py-1 text-xs rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => setEditingDescription(false)}
                className="px-2.5 py-1 text-xs rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p
            className="text-base text-[var(--text)] leading-relaxed cursor-pointer hover:bg-[var(--surface-hover)] rounded px-1 -mx-1 transition-colors"
            onClick={() => { setDescriptionDraft(task.description); setEditingDescription(true) }}
            title="Click to edit"
          >
            <AutoLinkText text={task.description} />
          </p>
        )}
      </div>

      {/* Consolidation Suggestions */}
      {(consolidation_suggestions ?? []).length > 0 && (
        <div className="space-y-2">
          {consolidation_suggestions.map((cs) => (
            <div
              key={cs.id}
              className="rounded-lg border border-violet-200 bg-violet-50 p-3 space-y-2"
            >
              <div className="flex items-start gap-2">
                <GitMerge className="w-3.5 h-3.5 text-violet-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-violet-800">Related task found</p>
                  <p className="text-xs text-violet-700 mt-0.5">{cs.reason}</p>
                </div>
              </div>

              {cs.other_task_description && (
                <div className="bg-violet-100/50 rounded px-2.5 py-1.5">
                  <p className="text-[10px] text-violet-600 uppercase tracking-wider font-medium mb-0.5">
                    {cs.direction === 'new' ? 'Existing task' : 'New task'}
                  </p>
                  <p className="text-xs text-violet-800">{cs.other_task_description}</p>
                </div>
              )}

              <div className="bg-violet-100/50 rounded px-2.5 py-1.5">
                <p className="text-[10px] text-violet-600 uppercase tracking-wider font-medium mb-0.5">
                  Suggested merged description
                </p>
                <p className="text-xs text-violet-800">{cs.merged_description}</p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => resolveConsolidation(cs.id, 'accept')}
                  disabled={resolvingConsolidation === cs.id}
                  className="px-2.5 py-1 text-xs rounded-md border border-violet-300 bg-violet-100 text-violet-800 hover:bg-violet-200 transition-colors disabled:opacity-50"
                >
                  {resolvingConsolidation === cs.id ? 'Merging...' : 'Merge tasks'}
                </button>
                <button
                  onClick={() => resolveConsolidation(cs.id, 'dismiss')}
                  disabled={resolvingConsolidation === cs.id}
                  className="px-2.5 py-1 text-xs rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--text)] transition-colors disabled:opacity-50"
                >
                  Keep separate
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Status (read-only) */}
      <Section label="Status">
        <div className="flex items-center gap-2 flex-wrap">
          {task.waiting_on ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-sm font-medium border bg-amber-50 text-amber-700 border-amber-200">
              <Hourglass className="w-3 h-3" />
              Waiting On {task.waiting_on?.toLowerCase().startsWith('brandy') ? 'You' : task.waiting_on}
            </span>
          ) : (
            <StatusBadge status={task.status} />
          )}
          {task.escalation && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-sm font-medium border border-red-300 bg-red-50 text-red-700">
              <AlertTriangle className="w-3 h-3" />
              Escalated
            </span>
          )}
        </div>
      </Section>

      {/* Actions */}
      <Section label="Actions">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Plate It — for open, tracking, waiting-on tasks */}
          {(task.status === 'open' || task.status === 'tracking' || task.waiting_on) && task.status !== 'done' && (
            <button
              disabled={updating}
              onClick={() => updateTask({ status: 'done', waiting_on: null })}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
            >
              <CheckCircle2 className="w-3 h-3" />
              Plate It
            </button>
          )}
          {/* Track It — for open, waiting-on tasks (not already tracking) */}
          {(task.status === 'open' || (task.waiting_on && task.status !== 'tracking')) && task.status !== 'done' && task.status !== 'dismissed' && (
            <button
              disabled={updating}
              onClick={() => setShowTrackingSetup(true)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors"
            >
              <Eye className="w-3 h-3" />
              Track It
            </button>
          )}
          {/* Waiting On — for open, tracking tasks (not already waiting) */}
          {(task.status === 'open' || task.status === 'tracking') && !task.waiting_on && (
            <button
              disabled={updating}
              onClick={() => {
                setEditing(true)
                setTimeout(() => waitingInputRef.current?.focus(), 0)
              }}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
            >
              <Hourglass className="w-3 h-3" />
              Waiting On
            </button>
          )}
          {/* Take Over — for tracking, waiting-on tasks */}
          {(task.status === 'tracking' || task.waiting_on) && task.status !== 'done' && task.status !== 'dismissed' && (
            <button
              disabled={updating}
              onClick={() => updateTask({ status: 'open', waiting_on: null, tracked_owner: null, follow_up_date: null })}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
            >
              <ArrowLeft className="w-3 h-3" />
              Take Over
            </button>
          )}
          {/* Not a Task — for open, tracking, waiting-on tasks */}
          {(task.status === 'open' || task.status === 'tracking' || task.waiting_on) && task.status !== 'done' && task.status !== 'dismissed' && (
            <button
              disabled={updating}
              onClick={() => updateTask({ status: 'dismissed', waiting_on: null })}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--text)] transition-colors"
            >
              <Ban className="w-3 h-3" />
              Not a Task
            </button>
          )}
          {/* Restore — for dismissed, plated tasks */}
          {(task.status === 'dismissed' || task.status === 'done') && (
            <button
              disabled={updating}
              onClick={() => updateTask({ status: 'open', waiting_on: null })}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
            >
              <ArrowLeft className="w-3 h-3" />
              Restore
            </button>
          )}
          {/* Escalation toggle */}
          <span className="text-[var(--border)]">|</span>
          <button
            disabled={updating}
            onClick={() => updateTask({ escalation: !task.escalation })}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border transition-colors ${
              task.escalation
                ? 'border-red-300 bg-red-50 text-red-700 font-medium'
                : 'border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            <AlertTriangle className="w-3 h-3" />
            {task.escalation ? 'De-escalate' : 'Escalate'}
          </button>
          <span className="text-[var(--border)]">|</span>
          <button
            disabled={updating}
            onClick={() => updateTask({ public: !task.public })}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border transition-colors ${
              task.public
                ? 'border-teal-200 bg-teal-50 text-teal-700'
                : 'border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            <Globe className="w-3 h-3" />
            {task.public ? 'Public' : 'Private'}
          </button>
        </div>
      </Section>

      {/* Tracking Setup Inline Form */}
      {showTrackingSetup && (
        <Section label="Set Up Tracking">
          <TrackingSetupForm
            taskId={taskId}
            currentOwner={task.tracked_owner}
            currentFollowUp={task.follow_up_date}
            entities={allEntities}
            onSave={async (owner, followUp) => {
              await updateTask({
                status: 'tracking',
                tracked_owner: owner || null,
                follow_up_date: followUp || null,
                waiting_on: null,
              })
              setShowTrackingSetup(false)
            }}
            onCancel={() => setShowTrackingSetup(false)}
          />
        </Section>
      )}

      {/* Tracking Info (when in tracking status) */}
      {task.status === 'tracking' && !showTrackingSetup && (
        <Section label="Tracking Details">
          <div className="space-y-2">
            {task.tracked_owner && (
              <div className="flex items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 text-purple-700 bg-purple-50 border border-purple-200 px-2 py-1 rounded-md">
                  👤 {task.tracked_owner}
                </span>
              </div>
            )}
            {task.follow_up_date && (() => {
              const today = new Date().toISOString().slice(0, 10)
              const isOverdue = task.follow_up_date <= today
              return (
                <div className={`flex items-center gap-2 text-xs ${isOverdue ? 'text-red-700' : 'text-[var(--text)]'}`}>
                  <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border ${
                    isOverdue ? 'bg-red-50 border-red-200 text-red-700' : 'bg-[var(--bg)] border-[var(--border)]'
                  }`}>
                    📅 {new Date(task.follow_up_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {isOverdue && <span className="font-medium ml-1">overdue</span>}
                  </span>
                </div>
              )
            })()}
            <button
              onClick={() => setShowTrackingSetup(true)}
              className="text-[10px] text-[var(--muted)] hover:text-[var(--text)] transition-colors"
            >
              edit tracking details
            </button>
          </div>
        </Section>
      )}

      {/* Due date */}
      <Section label="Due Date">
        {editingDueDate ? (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              autoFocus
              defaultValue={task.due_date ?? ''}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditingDueDate(false)
                if (e.key === 'Enter') {
                  const val = (e.target as HTMLInputElement).value
                  updateTask({ due_date: val || null })
                  setEditingDueDate(false)
                }
              }}
              className="flex-1 text-xs px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              ref={(el) => el?.focus()}
            />
            <button
              onClick={(e) => {
                const input = (e.currentTarget.previousElementSibling as HTMLInputElement)
                updateTask({ due_date: input.value || null })
                setEditingDueDate(false)
              }}
              className="px-2 py-1.5 text-xs rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
            >
              Save
            </button>
            {task.due_date && (
              <button
                onClick={() => {
                  updateTask({ due_date: null })
                  setEditingDueDate(false)
                }}
                className="px-2 py-1.5 text-xs rounded border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setEditingDueDate(false)}
              className="p-1.5 text-[var(--muted)] hover:text-[var(--text)] transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-[var(--text)]">
            <Clock className="w-3.5 h-3.5 text-[var(--muted)]" />
            {task.due_date ? (
              <button
                onClick={() => setEditingDueDate(true)}
                className="hover:text-[var(--accent)] transition-colors"
              >
                Due {new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </button>
            ) : (
              <button
                onClick={() => setEditingDueDate(true)}
                className="text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
              >
                + Add due date
              </button>
            )}
          </div>
        )}
      </Section>

      {/* Waiting On Inline Form */}
      {editing && (
        <Section label="Set Waiting On">
          <div className="relative">
            <div className="flex items-center gap-1.5">
              <input
                ref={waitingInputRef}
                autoFocus
                value={waitingOnInput}
                onChange={(e) => setWaitingOnInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && waitingOnInput.trim()) saveWaitingOn(waitingOnInput.trim())
                  if (e.key === 'Escape') { setEditing(false); setWaitingOnInput('') }
                }}
                placeholder="Type a name..."
                className="flex-1 text-xs px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
              />
              <button
                onClick={() => waitingOnInput.trim() && saveWaitingOn(waitingOnInput.trim())}
                disabled={!waitingOnInput.trim() || savingWaitingOn}
                className="px-2 py-1.5 text-xs rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
              >
                {savingWaitingOn ? '...' : 'Set'}
              </button>
              <button
                onClick={() => { setEditing(false); setWaitingOnInput('') }}
                className="p-1.5 text-[var(--muted)] hover:text-[var(--text)] transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            {waitingOnSuggestions.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {waitingOnSuggestions.map((entity) => (
                  <button
                    key={entity.id}
                    onClick={() => saveWaitingOn(entity.name)}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--surface-hover)] transition-colors flex items-center justify-between"
                  >
                    <span className="text-[var(--text)]">{entity.name}</span>
                    <span className="text-[var(--muted)] capitalize">{entity.type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Linked Entities */}
      <Section label="Linked Entities">
        {entities.filter(e => e.role !== 'project').length > 0 && (
          <div className="space-y-1.5 mb-3">
            {entities.filter(e => e.role !== 'project').map((e) => (
              <div key={e.id + e.role} className="group flex items-center gap-2 text-xs">
                <Users className="w-3.5 h-3.5 text-[var(--muted)]" />
                <span className="text-[var(--text)]">{e.name}</span>
                <span className="text-[var(--muted)] capitalize">({e.role})</span>
                <button
                  onClick={() => unlinkEntity(e.id)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-[var(--muted)] hover:text-red-600 transition-all"
                  title="Unlink entity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {entities.filter(e => e.role !== 'project').length === 0 && (
          <p className="text-xs text-[var(--muted)] mb-3">No linked entities yet.</p>
        )}
        {linkingEntity ? (
          <span className="text-xs text-[var(--muted)]">Linking...</span>
        ) : (
          <div className="flex gap-2">
            <select
              className="flex-1 text-xs px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] cursor-pointer hover:border-[var(--accent)] focus:border-[var(--accent)] focus:outline-none"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  linkEntity(e.target.value)
                  e.target.value = ''
                }
              }}
            >
              <option value="" disabled>+ Link person...</option>
              {['contact', 'brand', 'department', 'vendor', 'vendor_team', 'freelancer', 'franchisee'].map(type => {
                const group = allEntities.filter(e => e.type === type && !entities.some(linked => linked.id === e.id))
                if (!group.length) return null
                const label = { brand: 'Brands', department: 'Internal Team', contact: 'People', vendor: 'Vendors', vendor_team: 'Vendor Team', freelancer: 'Freelancers', franchisee: 'Franchisees' }[type] ?? type
                return (
                  <optgroup key={type} label={label}>
                    {group.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </optgroup>
                )
              })}
            </select>
            <select
              className="flex-1 text-xs px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] cursor-pointer hover:border-[var(--accent)] focus:border-[var(--accent)] focus:outline-none"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  linkEntity(e.target.value)
                  e.target.value = ''
                }
              }}
            >
              <option value="" disabled>+ Link project...</option>
              {(() => {
                const projects = allEntities.filter(e => e.type === 'project' && !entities.some(linked => linked.id === e.id))
                return projects.map(e => <option key={e.id} value={e.id}>{e.name}</option>)
              })()}
            </select>
          </div>
        )}
      </Section>

      {/* Tags */}
      <Section label="Tags">
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {(task.tags ?? []).map((tag) => (
            <span
              key={tag}
              className="group inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
              style={{
                backgroundColor: tagColor(tag).bg,
                color: tagColor(tag).text,
                borderColor: tagColor(tag).border,
              }}
            >
              {tag}
              <button
                onClick={() => removeTag(tag)}
                className="opacity-0 group-hover:opacity-100 hover:text-red-600 transition-all"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {(task.tags ?? []).length === 0 && !showTagInput && (
            <span className="text-xs text-[var(--muted)]">No tags yet.</span>
          )}
          {showTagInput ? (
            <div className="relative">
              <div className="flex items-center gap-1">
                <input
                  ref={tagInputRef}
                  autoFocus
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && tagInput.trim()) addTag(tagInput.trim())
                    if (e.key === 'Escape') { setShowTagInput(false); setTagInput('') }
                  }}
                  placeholder="tag name..."
                  className="text-xs px-2 py-1 rounded-full border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] w-28"
                />
                <button
                  onClick={() => tagInput.trim() && addTag(tagInput.trim())}
                  disabled={!tagInput.trim()}
                  className="px-1.5 py-1 text-[10px] rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
                >
                  Add
                </button>
                <button
                  onClick={() => { setShowTagInput(false); setTagInput('') }}
                  className="p-0.5 text-[var(--muted)] hover:text-[var(--text)]"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              {tagSuggestions.length > 0 && (
                <div className="absolute z-10 top-full left-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg max-h-32 overflow-y-auto min-w-[160px]">
                  {tagSuggestions.map((t) => (
                    <button
                      key={t}
                      onClick={() => addTag(t)}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--surface-hover)] transition-colors flex items-center gap-2"
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: tagColor(t).text }}
                      />
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => {
                setShowTagInput(true)
                setTimeout(() => tagInputRef.current?.focus(), 0)
              }}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded-full border border-dashed border-[var(--border)] text-[var(--muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors"
            >
              <Plus className="w-3 h-3" />
              tag
            </button>
          )}
        </div>
      </Section>

      {/* Source Dumpling */}
      {source_entry && (
        <Section label="Source Dumpling">
          <ExpandableSource entry={source_entry} />
        </Section>
      )}

      {/* Events Timeline */}
      {events.length > 0 && (
        <Section label="Activity">
          <div className="space-y-2">
            {events.map((event) => (
              <div key={event.id} className="flex items-start gap-2 text-xs">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--muted)] mt-1.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-[var(--text)]">{formatEvent(event)}</span>
                  <span className="text-[var(--muted)] ml-2">{formatDate(event.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Notes */}
      <Section label="Notes">
        <div className="space-y-2">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note..."
            rows={2}
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] resize-none"
          />
          <button
            onClick={async () => {
              if (!noteText.trim()) return
              setSavingNote(true)
              try {
                await fetch(`/api/tasks/${taskId}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ add_note: noteText.trim() }),
                })
                setNoteText('')
                await loadData()
                showFeedback('Note added ✓')
              } finally {
                setSavingNote(false)
              }
            }}
            disabled={!noteText.trim() || savingNote}
            className="px-3 py-1.5 text-xs rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
          >
            {savingNote ? 'Saving...' : 'Add Note'}
          </button>
        </div>
      </Section>

      {/* Team Comments */}
      <Section label="Team Comments">
        <TaskComments
          taskId={taskId}
          comments={comments}
          loading={loadingComments}
          onResolve={async (commentId) => {
            // Optimistic update
            setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, is_resolved: true } : c))
            await fetch(`/api/tasks/${taskId}/comments/${commentId}`, { method: 'PATCH' })
            showFeedback('Comment resolved ✓')
            onUpdate?.()
          }}
        />
      </Section>

      {/* Draft Email */}
      <Section label="Draft Email">
        <EmailDrafter
          taskDescription={task.description}
          status={task.status}
          waitingOn={task.waiting_on}
          trackedOwner={task.tracked_owner}
          entities={entities}
        />
      </Section>

      {/* Timestamps */}
      <Section label="Timestamps">
        <div className="space-y-1 text-xs text-[var(--muted)]">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" />
            <span>Created {formatDate(task.created_at)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" />
            <span>Updated {formatDate(task.updated_at)}</span>
          </div>
        </div>
      </Section>
    </div>
  )
}

function TrackingSetupForm({
  taskId,
  currentOwner,
  currentFollowUp,
  entities,
  onSave,
  onCancel,
}: {
  taskId: string
  currentOwner: string | null
  currentFollowUp: string | null
  entities: Array<{ id: string; name: string; type: string }>
  onSave: (owner: string, followUp: string) => void
  onCancel: () => void
}) {
  const [owner, setOwner] = useState(currentOwner ?? '')
  const [followUp, setFollowUp] = useState(currentFollowUp ?? '')
  const [saving, setSaving] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  const suggestions = showSuggestions && owner.trim().length > 0
    ? entities
        .filter((e) =>
          ['contact', 'vendor', 'franchisee', 'freelancer', 'vendor_team', 'brand', 'department'].includes(e.type) &&
          e.name.toLowerCase().includes(owner.toLowerCase())
        )
        .slice(0, 6)
    : []

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [])

  return (
    <div className="space-y-3">
      <div className="relative">
        <label className="text-[10px] text-[var(--muted)] uppercase tracking-wider font-medium mb-1 block">
          Owner
        </label>
        <input
          ref={inputRef}
          value={owner}
          onChange={(e) => { setOwner(e.target.value); setShowSuggestions(true) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSave(owner.trim(), followUp)
            if (e.key === 'Escape') onCancel()
          }}
          placeholder="Who's responsible?"
          className="w-full text-xs px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
        />
        {suggestions.length > 0 && (
          <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg max-h-40 overflow-y-auto">
            {suggestions.map((entity) => (
              <button
                key={entity.id}
                onClick={() => { setOwner(entity.name); setShowSuggestions(false) }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--surface-hover)] transition-colors flex items-center justify-between"
              >
                <span className="text-[var(--text)]">{entity.name}</span>
                <span className="text-[var(--muted)] capitalize">{entity.type}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className="text-[10px] text-[var(--muted)] uppercase tracking-wider font-medium mb-1 block">
          Follow-up Date
        </label>
        <input
          type="date"
          value={followUp}
          onChange={(e) => setFollowUp(e.target.value)}
          className="w-full text-xs px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onSave(owner.trim(), followUp)}
          disabled={saving}
          className="px-3 py-1.5 text-xs rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40 transition-colors"
        >
          {saving ? 'Saving...' : 'Start Tracking'}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[var(--border)] pt-4">
      <h4 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)] mb-2.5">
        {label}
      </h4>
      {children}
    </div>
  )
}

function EmailDrafter({
  taskDescription,
  status,
  waitingOn,
  trackedOwner,
  entities,
}: {
  taskDescription: string
  status: string
  waitingOn: string | null
  trackedOwner: string | null
  entities: Array<{ id: string; name: string; type: string; role: string }>
}) {
  const [prompt, setPrompt] = useState('')
  const [draft, setDraft] = useState('')
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)

  async function generate() {
    if (!prompt.trim()) return
    setGenerating(true)
    setDraft('')
    try {
      const res = await fetch('/api/tasks/draft-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_description: taskDescription,
          status,
          waiting_on: waitingOn,
          tracked_owner: trackedOwner,
          entities,
          prompt: prompt.trim(),
        }),
      })
      const data = await res.json()
      setDraft(data.email ?? '')
    } finally {
      setGenerating(false)
    }
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(draft)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-2">
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="What do you want to say? e.g. 'follow up on status, need update by Friday'"
        rows={2}
        className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] resize-none"
      />
      <button
        onClick={generate}
        disabled={!prompt.trim() || generating}
        className="px-3 py-1.5 text-xs rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
      >
        {generating ? 'Drafting...' : 'Generate Email'}
      </button>
      {draft && (
        <div className="mt-2">
          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] whitespace-pre-wrap">
            {draft}
          </div>
          <button
            onClick={copyToClipboard}
            className="mt-1.5 px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            {copied ? 'Copied!' : 'Copy to clipboard'}
          </button>
        </div>
      )}
    </div>
  )
}

function ExpandableSource({ entry }: { entry: { source: string; created_at: string; raw_text: string } }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = entry.raw_text.length > 300

  return (
    <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <FileText className="w-3.5 h-3.5 text-[var(--muted)]" />
        <span className="text-xs text-[var(--muted)] capitalize">{entry.source}</span>
        <span className="text-xs text-[var(--muted)]">{formatDate(entry.created_at)}</span>
      </div>
      <p className={`text-xs text-[var(--text)] leading-relaxed whitespace-pre-wrap ${!expanded && isLong ? 'line-clamp-4' : ''}`}>
        <AutoLinkText text={entry.raw_text} />
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] mt-1.5"
        >
          {expanded ? 'show less' : 'show more'}
        </button>
      )}
    </div>
  )
}

function TaskComments({
  taskId,
  comments,
  loading,
  onResolve,
}: {
  taskId: string
  comments: Array<{ id: string; author_name: string; author_email: string | null; content: string; is_resolved: boolean; created_at: string }>
  loading: boolean
  onResolve: (commentId: string) => void
}) {
  const unresolved = comments.filter((c) => !c.is_resolved)
  const resolved = comments.filter((c) => c.is_resolved)

  if (loading) {
    return <p className="text-xs text-[var(--muted)]">Loading comments...</p>
  }

  if (comments.length === 0) {
    return <p className="text-xs text-[var(--muted)]">No team comments yet.</p>
  }

  return (
    <div className="space-y-2">
      {unresolved.map((comment) => (
        <div
          key={comment.id}
          className="border-l-[3px] border-l-amber-400 bg-amber-50/50 rounded-r-lg px-3 py-2"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-medium text-[var(--text)]">{comment.author_name}</span>
                <span className="text-[10px] text-[var(--muted)]">{formatDate(comment.created_at)}</span>
              </div>
              <p className="text-xs text-[var(--text)] mt-0.5 leading-relaxed">{comment.content}</p>
            </div>
            <button
              onClick={() => onResolve(comment.id)}
              className="shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] rounded border border-amber-200 bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
              title="Resolve this comment"
            >
              <Check className="w-3 h-3" />
              Resolve
            </button>
          </div>
        </div>
      ))}
      {resolved.length > 0 && (
        <div className="space-y-1.5 mt-2">
          {resolved.map((comment) => (
            <div
              key={comment.id}
              className="border-l-[3px] border-l-gray-200 bg-[var(--bg)] rounded-r-lg px-3 py-2 opacity-60"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-medium text-[var(--muted)]">{comment.author_name}</span>
                <span className="text-[10px] text-[var(--muted)]">{formatDate(comment.created_at)}</span>
                <span className="text-[10px] text-green-600">resolved</span>
              </div>
              <p className="text-xs text-[var(--muted)] mt-0.5 line-through">{comment.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const TAG_PALETTE = [
  { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' }, // amber
  { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' }, // blue
  { bg: '#f3e8ff', text: '#6b21a8', border: '#c4b5fd' }, // purple
  { bg: '#dcfce7', text: '#166534', border: '#86efac' }, // green
  { bg: '#ffe4e6', text: '#9f1239', border: '#fda4af' }, // rose
  { bg: '#e0f2fe', text: '#075985', border: '#7dd3fc' }, // sky
  { bg: '#fef9c3', text: '#854d0e', border: '#fde047' }, // yellow
  { bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4' }, // pink
]

function tagColor(tag: string): { bg: string; text: string; border: string } {
  let hash = 0
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash)
  }
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length]
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function formatEvent(event: { event_type: string; metadata: Record<string, unknown> | null }): string {
  const meta = event.metadata ?? {}
  switch (event.event_type) {
    case 'created':
      return 'Task created'
    case 'status_change': {
      const label = (s: unknown) => s === 'done' ? 'plated' : String(s ?? '?')
      return `Status changed from ${label(meta.from)} to ${label(meta.to)}`
    }
    case 'escalated':
      return `Escalated${meta.reason ? ` — ${meta.reason}` : ''}`
    case 'de_escalated':
      return `De-escalated${meta.reason ? ` — ${meta.reason}` : ''}`
    case 'due_date_changed':
      return `Due date changed${meta.from ? ` from ${meta.from}` : ''} to ${meta.to ?? '?'}`
    case 'note_added':
      return `Note: ${meta.note ?? '(no content)'}`
    case 'nudged':
      return 'Nudge sent'
    default:
      return event.event_type
  }
}
