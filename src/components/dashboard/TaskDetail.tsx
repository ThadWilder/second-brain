'use client'

import { useState, useEffect, useRef } from 'react'
import { Clock, Users, FileText, AlertTriangle, Loader2, GitMerge, Hourglass, X, Eye, ArrowLeft, CheckCircle2, Ban } from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
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

  async function loadData() {
    const r = await fetch(`/api/tasks/${taskId}`)
    setData(await r.json())
  }

  useEffect(() => {
    setLoading(true)
    loadData().finally(() => setLoading(false))
    // Fetch all entities for linking
    fetch('/api/dashboard').then(r => r.json()).then(d => {
      setAllEntities(d.allEntities ?? [])
    }).catch(() => {})
  }, [taskId])

  async function linkEntity(entityId: string) {
    setLinkingEntity(true)
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link_entity_id: entityId, link_role: 'related' }),
      })
      await loadData()
      showFeedback('Entity linked ✓')
    } finally {
      setLinkingEntity(false)
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

  async function updateTask(updates: Record<string, unknown>) {
    setUpdating(true)
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, ...updates }),
    })
    await loadData()
    setUpdating(false)
    showFeedback(updates.status === 'closed' ? 'Task closed ✓' : 'Updated ✓')
    onUpdate?.()
  }

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

      {/* Description */}
      <div>
        <p className="text-base text-[var(--text)] leading-relaxed">
          <AutoLinkText text={task.description} />
        </p>
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

      {/* Status + Escalation */}
      <Section label="Status">
        <div className="flex items-center gap-2 flex-wrap">
          {(['open', 'blocked', 'done', 'tracking'] as TaskStatus[]).map((s) => (
            <button
              key={s}
              disabled={updating}
              onClick={() => {
                if (s === 'tracking') {
                  setShowTrackingSetup(true)
                } else {
                  updateTask({ status: s })
                }
              }}
              className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                task.status === s
                  ? s === 'tracking'
                    ? 'border-purple-300 bg-purple-50 text-purple-700 font-medium'
                    : 'border-[var(--accent)] bg-amber-50 text-[var(--accent)] font-medium'
                  : 'border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              {s === 'tracking' ? '👁️ tracking' : s}
            </button>
          ))}

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
            {task.escalation ? 'Escalated' : 'Escalate'}
          </button>
        </div>
      </Section>

      {/* Quick Actions */}
      <Section label="Actions">
        <div className="flex items-center gap-2 flex-wrap">
          {task.status !== 'tracking' && (
            <button
              disabled={updating}
              onClick={() => setShowTrackingSetup(true)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors"
            >
              <Eye className="w-3 h-3" />
              Track
            </button>
          )}
          {task.status === 'tracking' && (
            <>
              <button
                disabled={updating}
                onClick={() => updateTask({ status: 'open', tracked_owner: null, follow_up_date: null })}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
              >
                <ArrowLeft className="w-3 h-3" />
                Take Over
              </button>
              <button
                disabled={updating}
                onClick={() => updateTask({ status: 'done' })}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
              >
                <CheckCircle2 className="w-3 h-3" />
                Plate It
              </button>
            </>
          )}
          {task.status === 'open' && !task.waiting_on && (
            <button
              disabled={updating}
              onClick={() => updateTask({ status: 'done' })}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
            >
              <CheckCircle2 className="w-3 h-3" />
              Plate It
            </button>
          )}
          {task.status !== 'done' && (
            <button
              disabled={updating}
              onClick={() => updateTask({ status: 'dismissed' })}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--text)] transition-colors"
            >
              <Ban className="w-3 h-3" />
              Not a task
            </button>
          )}
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
      {task.due_date && (
        <Section label="Due Date">
          <div className="flex items-center gap-2 text-xs text-[var(--text)]">
            <Clock className="w-3.5 h-3.5 text-[var(--muted)]" />
            <span>Due {task.due_date}</span>
          </div>
        </Section>
      )}

      {/* Waiting On */}
      <Section label="Waiting On">
        <WaitingOnField
          taskId={taskId}
          currentValue={task.waiting_on}
          entities={allEntities}
          onUpdate={async () => {
            await loadData()
            showFeedback('Updated ✓')
            onUpdate?.()
          }}
        />
      </Section>

      {/* Linked Entities */}
      <Section label="Linked Entities">
        {entities.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {entities.map((e) => (
              <div key={e.id + e.role} className="flex items-center gap-2 text-xs">
                <Users className="w-3.5 h-3.5 text-[var(--muted)]" />
                <span className="text-[var(--text)]">{e.name}</span>
                <span className="text-[var(--muted)] capitalize">({e.role})</span>
              </div>
            ))}
          </div>
        )}
        {entities.length === 0 && (
          <p className="text-xs text-[var(--muted)] mb-3">No linked entities yet.</p>
        )}
        {linkingEntity ? (
          <span className="text-xs text-[var(--muted)]">Linking...</span>
        ) : (
          <select
            className="w-full text-xs px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] cursor-pointer hover:border-[var(--accent)] focus:border-[var(--accent)] focus:outline-none"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                linkEntity(e.target.value)
                e.target.value = ''
              }
            }}
          >
            <option value="" disabled>+ Link entity...</option>
            {['brand', 'department', 'contact', 'vendor', 'vendor_team', 'freelancer', 'franchisee'].map(type => {
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
        )}
      </Section>

      {/* Source Dumpling */}
      {source_entry && (
        <Section label="Source Dumpling">
          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <FileText className="w-3.5 h-3.5 text-[var(--muted)]" />
              <span className="text-xs text-[var(--muted)] capitalize">{source_entry.source}</span>
              <span className="text-xs text-[var(--muted)]">
                {formatDate(source_entry.created_at)}
              </span>
            </div>
            <p className="text-xs text-[var(--text)] leading-relaxed whitespace-pre-wrap">
              <AutoLinkText text={source_entry.raw_text} />
            </p>
          </div>
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

function WaitingOnField({
  taskId,
  currentValue,
  entities,
  onUpdate,
}: {
  taskId: string
  currentValue: string | null
  entities: Array<{ id: string; name: string; type: string }>
  onUpdate: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const suggestions = inputValue.trim().length > 0
    ? entities
        .filter((e) =>
          ['contact', 'vendor', 'franchisee', 'freelancer', 'vendor_team', 'brand', 'department'].includes(e.type) &&
          e.name.toLowerCase().includes(inputValue.toLowerCase())
        )
        .slice(0, 6)
    : []

  async function save(value: string) {
    setSaving(true)
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, waiting_on: value || null }),
      })
      setEditing(false)
      setInputValue('')
      onUpdate()
    } finally {
      setSaving(false)
    }
  }

  async function clear() {
    await save('')
  }

  if (currentValue && !editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md">
          <Hourglass className="w-3 h-3" />
          {currentValue}
        </span>
        <button
          onClick={() => { setEditing(true); setInputValue(currentValue) }}
          className="text-[10px] text-[var(--muted)] hover:text-[var(--text)] transition-colors"
        >
          change
        </button>
        <button
          onClick={clear}
          disabled={saving}
          className="text-[10px] text-[var(--muted)] hover:text-red-600 transition-colors"
        >
          clear
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {!editing ? (
        <button
          onClick={() => { setEditing(true); setTimeout(() => inputRef.current?.focus(), 0) }}
          className="text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors"
        >
          + Set waiting on...
        </button>
      ) : (
        <div className="relative">
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              autoFocus
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && inputValue.trim()) save(inputValue.trim())
                if (e.key === 'Escape') { setEditing(false); setInputValue('') }
              }}
              placeholder="Type a name..."
              className="flex-1 text-xs px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
            />
            <button
              onClick={() => inputValue.trim() && save(inputValue.trim())}
              disabled={!inputValue.trim() || saving}
              className="px-2 py-1.5 text-xs rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
            >
              {saving ? '...' : 'Set'}
            </button>
            <button
              onClick={() => { setEditing(false); setInputValue('') }}
              className="p-1.5 text-[var(--muted)] hover:text-[var(--text)] transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          {suggestions.length > 0 && (
            <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg max-h-40 overflow-y-auto">
              {suggestions.map((entity) => (
                <button
                  key={entity.id}
                  onClick={() => save(entity.name)}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--surface-hover)] transition-colors flex items-center justify-between"
                >
                  <span className="text-[var(--text)]">{entity.name}</span>
                  <span className="text-[var(--muted)] capitalize">{entity.type}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
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
  const inputRef = useRef<HTMLInputElement>(null)

  const suggestions = owner.trim().length > 0
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
          onChange={(e) => setOwner(e.target.value)}
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
                onClick={() => setOwner(entity.name)}
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

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function formatEvent(event: { event_type: string; metadata: Record<string, unknown> | null }): string {
  const meta = event.metadata ?? {}
  switch (event.event_type) {
    case 'created':
      return 'Task created'
    case 'status_change':
      return `Status changed from ${meta.from ?? '?'} to ${meta.to ?? '?'}`
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
