'use client'

import { useState, useEffect } from 'react'
import { Clock, Users, FileText, AlertTriangle, Loader2 } from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { TaskStatus, EventType } from '@/types'

interface TaskData {
  task: {
    id: string
    description: string
    status: TaskStatus
    escalation: boolean
    due_date: string | null
    waiting_on: string | null
    entry_id: string | null
    created_at: string
    updated_at: string
  }
  entities: Array<{ id: string; name: string; type: string; role: string }>
  events: Array<{ id: string; event_type: EventType; metadata: Record<string, unknown> | null; created_at: string }>
  source_entry: { id: string; raw_text: string; source: string; created_at: string } | null
}

export function TaskDetail({ taskId, onUpdate }: { taskId: string; onUpdate?: () => void }) {
  const [data, setData] = useState<TaskData | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  async function loadData() {
    const r = await fetch(`/api/tasks/${taskId}`)
    setData(await r.json())
  }

  useEffect(() => {
    setLoading(true)
    loadData().finally(() => setLoading(false))
  }, [taskId])

  async function updateTask(updates: Record<string, unknown>) {
    setUpdating(true)
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, ...updates }),
    })
    // Re-fetch detail
    await loadData()
    setUpdating(false)
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

  const { task, entities, events, source_entry } = data

  return (
    <div className="space-y-5">
      {/* Description */}
      <div>
        <p className="text-sm text-[var(--text)] leading-relaxed">{task.description}</p>
      </div>

      {/* Status + Escalation */}
      <Section label="Status">
        <div className="flex items-center gap-2 flex-wrap">
          {(['open', 'blocked', 'done'] as TaskStatus[]).map((s) => (
            <button
              key={s}
              disabled={updating}
              onClick={() => updateTask({ status: s })}
              className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                task.status === s
                  ? 'border-[var(--accent)] bg-amber-50 text-[var(--accent)] font-medium'
                  : 'border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              {s}
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

      {/* Due date & Waiting on */}
      {(task.due_date || task.waiting_on) && (
        <Section label="Details">
          <div className="space-y-1.5">
            {task.due_date && (
              <div className="flex items-center gap-2 text-xs text-[var(--text)]">
                <Clock className="w-3.5 h-3.5 text-[var(--muted)]" />
                <span>Due {task.due_date}</span>
              </div>
            )}
            {task.waiting_on && (
              <div className="flex items-center gap-2 text-xs text-amber-700">
                <Clock className="w-3.5 h-3.5" />
                <span>Waiting on {task.waiting_on}</span>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Linked Entities */}
      {entities.length > 0 && (
        <Section label="Linked Entities">
          <div className="space-y-1.5">
            {entities.map((e) => (
              <div key={e.id + e.role} className="flex items-center gap-2 text-xs">
                <Users className="w-3.5 h-3.5 text-[var(--muted)]" />
                <span className="text-[var(--text)]">{e.name}</span>
                <span className="text-[var(--muted)] capitalize">({e.role})</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Source Dumpling */}
      {source_entry && (
        <Section label="Source Dumpling">
          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <FileText className="w-3.5 h-3.5 text-[var(--muted)]" />
              <span className="text-xs text-[var(--muted)] capitalize">{source_entry.source}</span>
              <span className="text-xs text-[var(--muted)]">
                {formatDate(source_entry.created_at)}
              </span>
            </div>
            <p className="text-xs text-[var(--text)] leading-relaxed line-clamp-6 whitespace-pre-wrap">
              {source_entry.raw_text}
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
                loadData()
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

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[var(--border)] pt-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-2">
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
