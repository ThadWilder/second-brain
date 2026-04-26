'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useParams } from 'next/navigation'
import { FolderOpen, Clock, Link2, CheckCircle2, Circle, ExternalLink, ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/browser'

interface ProjectMeta {
  status?: 'active' | 'on_hold' | 'completed'
  description?: string | null
  target_date?: string | null
}

interface Project {
  id: string
  name: string
  metadata: ProjectMeta | null
  first_seen: string
  last_seen: string
  created_at: string
}

interface Task {
  id: string
  description: string
  status: string
  due_date: string | null
  waiting_on: string | null
  created_at: string
  updated_at: string
}

interface DetailData {
  project: Project
  tasks: Task[]
  wiki_slug: string | null
}

const STATUS_CONFIG = {
  active: { label: 'Active', className: 'bg-green-50 text-green-700 border-green-200' },
  on_hold: { label: 'On Hold', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  completed: { label: 'Completed', className: 'bg-gray-100 text-gray-500 border-gray-200' },
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function ProjectDetailPage() {
  const params = useParams()
  const id = params?.id as string

  const [data, setData] = useState<DetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [descValue, setDescValue] = useState('')
  const [savingDesc, setSavingDesc] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)

  const fetchDetail = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${id}`)
      if (res.status === 404) { setNotFound(true); return }
      if (!res.ok) return
      const json: DetailData = await res.json()
      setData(json)
      setDescValue(json.project.metadata?.description ?? '')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchDetail() }, [fetchDetail])

  const handleStatusChange = async (status: string) => {
    if (!data) return
    setSavingStatus(true)
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        const json = await res.json()
        setData(prev => prev ? { ...prev, project: json.project } : prev)
      }
    } finally {
      setSavingStatus(false)
    }
  }

  const handleSaveDesc = async () => {
    if (!data) return
    setSavingDesc(true)
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: descValue }),
      })
      if (res.ok) {
        const json = await res.json()
        setData(prev => prev ? { ...prev, project: json.project } : prev)
        setEditingDesc(false)
      }
    } finally {
      setSavingDesc(false)
    }
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const openTasks = data?.tasks.filter(t => t.status !== 'done') ?? []
  const doneTasks = data?.tasks.filter(t => t.status === 'done') ?? []

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-[#2c2014] px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Image src="/logo-icon-white.png" alt="Dumpbox" width={32} height={32} />
          </Link>
          <Link href="/" className="text-white font-bold tracking-tight text-lg hover:text-white/90 transition-colors">
            Dumpbox
          </Link>
          <span className="text-white/20 select-none">/</span>
          <a href="/projects" className="text-sm text-white/70 hover:text-white transition-colors flex items-center gap-1.5">
            <FolderOpen size={14} />
            Projects
          </a>
          {data && (
            <>
              <span className="text-white/20 select-none">/</span>
              <span className="text-sm text-white/70 truncate max-w-[200px]">{data.project.name}</span>
            </>
          )}
        </div>
        <nav className="flex items-center gap-6">
          <a href="/wiki" className="text-base text-white/70 font-medium hover:text-white transition-colors">Wiki</a>
          <a href="/kpis" className="text-base text-white/70 font-medium hover:text-white transition-colors">KPIs</a>
          <a href="/tracking" className="text-base text-white/70 font-medium hover:text-white transition-colors flex items-center gap-1.5">The Kitchen</a>
          <a href="/history" className="text-base text-white/70 font-medium hover:text-white transition-colors flex items-center gap-1.5"><Clock size={15} />History</a>
          <a href="/links" className="text-base text-white/70 font-medium hover:text-white transition-colors flex items-center gap-1.5"><Link2 size={15} />Links</a>
          <a href="/projects" className="text-base text-white font-medium flex items-center gap-1.5"><FolderOpen size={15} />Projects</a>
          <button onClick={handleSignOut} className="text-base text-white/70 font-medium hover:text-white transition-colors">Sign out</button>
        </nav>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[860px] mx-auto px-4 py-8 space-y-6">

          {loading && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-12 text-center">
              <p className="text-sm text-[var(--muted)]">Loading...</p>
            </div>
          )}

          {notFound && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-12 text-center">
              <p className="text-[var(--muted)] mb-4">Project not found.</p>
              <a href="/projects" className="text-sm text-[var(--accent)] hover:underline flex items-center gap-1 justify-center">
                <ChevronLeft size={14} />
                Back to Projects
              </a>
            </div>
          )}

          {!loading && data && (
            <>
              {/* Project header card */}
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <h1 className="text-2xl font-bold text-[var(--text)]">{data.project.name}</h1>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Status badge + dropdown */}
                    <div className="relative">
                      <select
                        value={data.project.metadata?.status ?? 'active'}
                        onChange={e => handleStatusChange(e.target.value)}
                        disabled={savingStatus}
                        className={`text-xs px-2 py-1 rounded-full border font-medium cursor-pointer
                                    focus:outline-none focus:ring-2 focus:ring-[var(--accent)]
                                    appearance-none pr-6 disabled:opacity-60
                                    ${STATUS_CONFIG[data.project.metadata?.status ?? 'active']?.className ?? STATUS_CONFIG.active.className}`}
                      >
                        <option value="active">Active</option>
                        <option value="on_hold">On Hold</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>
                    {data.wiki_slug && (
                      <a
                        href={`/wiki/${data.wiki_slug}`}
                        className="text-xs text-[var(--muted)] hover:text-[var(--accent)] transition-colors flex items-center gap-1"
                        title="View wiki page"
                      >
                        <ExternalLink size={13} />
                        Wiki
                      </a>
                    )}
                  </div>
                </div>

                {/* Description */}
                <div>
                  {editingDesc ? (
                    <div className="space-y-2">
                      <textarea
                        value={descValue}
                        onChange={e => setDescValue(e.target.value)}
                        rows={3}
                        autoFocus
                        placeholder="Add a description..."
                        className="w-full px-3 py-2 text-sm bg-white border border-[var(--border)] rounded-lg
                                   text-[var(--text)] placeholder:text-[var(--muted)] resize-none
                                   focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveDesc}
                          disabled={savingDesc}
                          className="px-3 py-1.5 text-xs font-medium bg-[var(--accent)] text-white rounded-lg
                                     hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
                        >
                          {savingDesc ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={() => { setEditingDesc(false); setDescValue(data.project.metadata?.description ?? '') }}
                          disabled={savingDesc}
                          className="px-3 py-1.5 text-xs font-medium border border-[var(--border)] text-[var(--text)] rounded-lg
                                     hover:bg-[var(--surface-hover)] transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingDesc(true)}
                      className="text-sm text-left w-full group"
                    >
                      {data.project.metadata?.description ? (
                        <span className="text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
                          {data.project.metadata.description}
                        </span>
                      ) : (
                        <span className="text-[var(--muted)] italic group-hover:text-[var(--accent)] transition-colors">
                          Add a description...
                        </span>
                      )}
                    </button>
                  )}
                </div>

                {/* Meta row */}
                <div className="flex items-center gap-4 pt-2 border-t border-[var(--border)] text-xs text-[var(--muted)]">
                  <span>Created {formatDate(data.project.created_at)}</span>
                  <span>Last activity {formatDate(data.project.last_seen)}</span>
                  {data.project.metadata?.target_date && (
                    <span>Target: {formatDate(data.project.metadata.target_date)}</span>
                  )}
                </div>
              </div>

              {/* Tasks section */}
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-[var(--text)] flex items-center gap-2">
                  Tasks
                  <span className="text-xs font-normal text-[var(--muted)]">
                    ({openTasks.length} open, {doneTasks.length} done)
                  </span>
                </h2>

                {data.tasks.length === 0 && (
                  <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8 text-center">
                    <p className="text-sm text-[var(--muted)]">No tasks linked to this project yet.</p>
                    <p className="text-xs text-[var(--muted)] mt-1">Tasks are linked when processed from dumplings.</p>
                  </div>
                )}

                {openTasks.length > 0 && (
                  <div className="space-y-1.5">
                    {openTasks.map(task => (
                      <TaskRow key={task.id} task={task} />
                    ))}
                  </div>
                )}

                {doneTasks.length > 0 && (
                  <div className="space-y-1.5 opacity-60">
                    <p className="text-xs text-[var(--muted)] pt-2">Completed</p>
                    {doneTasks.map(task => (
                      <TaskRow key={task.id} task={task} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function TaskRow({ task }: { task: Task }) {
  const isDone = task.status === 'done'
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 flex items-start gap-3
                    hover:border-[var(--accent)]/30 transition-colors">
      {isDone
        ? <CheckCircle2 size={16} className="text-green-500 shrink-0 mt-0.5" />
        : <Circle size={16} className="text-[var(--muted)] shrink-0 mt-0.5" />
      }
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${isDone ? 'line-through text-[var(--muted)]' : 'text-[var(--text)]'}`}>
          {task.description}
        </p>
        <div className="flex items-center gap-3 mt-1 text-xs text-[var(--muted)]">
          {task.due_date && (
            <span>Due {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          )}
          {task.waiting_on && (
            <span>Waiting on {task.waiting_on}</span>
          )}
          <span>{new Date(task.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })}</span>
        </div>
      </div>
    </div>
  )
}
