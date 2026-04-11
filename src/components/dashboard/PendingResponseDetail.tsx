'use client'

import { useState, useEffect } from 'react'
import { Clock, FileText, Users, CheckCircle, Loader2 } from 'lucide-react'
import { AutoLinkText } from '@/components/ui/AutoLinkText'

interface PendingResponseData {
  pending_response: {
    id: string
    summary: string
    responded: boolean
    created_at: string
  }
  source_entry: { id: string; raw_text: string; source: string; created_at: string } | null
  entities: Array<{ id: string; name: string; type: string; role: string }>
}

export function PendingResponseDetail({
  pendingResponseId,
  onUpdate,
}: {
  pendingResponseId: string
  onUpdate?: () => void
}) {
  const [data, setData] = useState<PendingResponseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null)

  function showFeedback(msg: string) {
    setSavedFeedback(msg)
    setTimeout(() => setSavedFeedback(null), 2000)
  }

  async function loadData() {
    const r = await fetch(`/api/pending-responses/${pendingResponseId}`)
    setData(await r.json())
  }

  useEffect(() => {
    setLoading(true)
    loadData().finally(() => setLoading(false))
  }, [pendingResponseId])

  async function markResponded() {
    setMarking(true)
    await fetch(`/api/pending-responses/${pendingResponseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responded: true }),
    })
    await loadData()
    setMarking(false)
    showFeedback('Marked as responded ✓')
    onUpdate?.()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 text-[var(--muted)] animate-spin" />
      </div>
    )
  }

  if (!data?.pending_response) {
    return (
      <p className="text-sm text-[var(--muted)] py-8 text-center">Pending response not found.</p>
    )
  }

  const { pending_response: pr, source_entry, entities } = data

  return (
    <div className="space-y-5">
      {/* Feedback banner */}
      {savedFeedback && (
        <div className="bg-green-50 text-green-700 text-xs font-medium px-3 py-2 rounded-lg text-center animate-pulse">
          {savedFeedback}
        </div>
      )}

      {/* Summary */}
      <div>
        <p className="text-sm text-[var(--text)] leading-relaxed">
          <AutoLinkText text={pr.summary} />
        </p>
      </div>

      {/* Waiting duration */}
      <Section label="Status">
        <div className="flex items-center gap-2 text-xs">
          <Clock className="w-3.5 h-3.5 text-[var(--muted)]" />
          <span className="text-[var(--text)]">
            {pr.responded ? 'Responded' : `Waiting for ${formatAge(pr.created_at)}`}
          </span>
        </div>

        {!pr.responded && (
          <button
            onClick={markResponded}
            disabled={marking}
            className="mt-3 flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
          >
            {marking ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle className="w-3.5 h-3.5" />
            )}
            Mark as responded
          </button>
        )}

        {pr.responded && (
          <div className="mt-2 flex items-center gap-2 text-xs text-green-700">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Done</span>
          </div>
        )}
      </Section>

      {/* Linked entities */}
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
            <p className="text-xs text-[var(--text)] leading-relaxed whitespace-pre-wrap">
              <AutoLinkText text={source_entry.raw_text} />
            </p>
          </div>
        </Section>
      )}

      {/* Notes */}
      <Section label="Notes">
        <div className="space-y-2">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note about your response..."
            rows={2}
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] resize-none"
          />
          <button
            onClick={async () => {
              if (!noteText.trim()) return
              setSavingNote(true)
              try {
                await fetch(`/api/pending-responses/${pendingResponseId}`, {
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
        <div className="text-xs text-[var(--muted)] flex items-center gap-2">
          <Clock className="w-3.5 h-3.5" />
          <span>Created {formatDate(pr.created_at)}</span>
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
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatAge(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return 'less than an hour'
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}
