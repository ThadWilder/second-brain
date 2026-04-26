'use client'

import { useState, useEffect, useCallback } from 'react'
import { FolderOpen, Plus, X } from 'lucide-react'
import { Header } from '@/components/ui/Header'

interface ProjectMeta {
  status?: 'active' | 'on_hold' | 'completed'
  description?: string | null
  target_date?: string | null
}

interface TaskCounts {
  open: number
  done: number
}

interface Project {
  id: string
  name: string
  normalized_name: string
  metadata: ProjectMeta | null
  first_seen: string
  last_seen: string
  created_at: string
  task_counts: TaskCounts
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

const STATUS_CONFIG = {
  active: { label: 'Active', className: 'bg-green-50 text-green-700 border-green-200' },
  on_hold: { label: 'On Hold', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  completed: { label: 'Completed', className: 'bg-gray-100 text-gray-500 border-gray-200' },
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [createLoading, setCreateLoading] = useState(false)

  const fetchProjects = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/projects')
      if (!res.ok) return
      const data = await res.json()
      setProjects(data.projects ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createName.trim()) return
    setCreateLoading(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName.trim(),
          description: createDescription.trim() || undefined,
        }),
      })
      if (res.ok) {
        setCreateName('')
        setCreateDescription('')
        setShowCreateForm(false)
        fetchProjects()
      }
    } finally {
      setCreateLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header activePage="projects" />

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1100px] mx-auto px-4 py-8 space-y-6">

          {/* Title + Create button */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-[var(--text)]">Projects</h1>
              {!loading && (
                <p className="text-sm text-[var(--muted)] mt-0.5">
                  {projects.length} project{projects.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="px-3 py-2 text-sm font-medium bg-[var(--accent)] text-white rounded-lg
                         hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1.5"
            >
              <Plus size={14} />
              Create Project
            </button>
          </div>

          {/* Create form */}
          {showCreateForm && (
            <form
              onSubmit={handleCreateProject}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--text)]">New project</span>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="text-[var(--muted)] hover:text-[var(--text)] transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={createName}
                  onChange={e => setCreateName(e.target.value)}
                  placeholder="Project name"
                  required
                  autoFocus
                  className="flex-1 px-3 py-2 text-sm bg-white border border-[var(--border)] rounded-lg
                             text-[var(--text)] placeholder:text-[var(--muted)]
                             focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                />
                <input
                  type="text"
                  value={createDescription}
                  onChange={e => setCreateDescription(e.target.value)}
                  placeholder="Description (optional)"
                  className="flex-1 px-3 py-2 text-sm bg-white border border-[var(--border)] rounded-lg
                             text-[var(--text)] placeholder:text-[var(--muted)]
                             focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                />
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-4 py-2 text-sm font-medium bg-[var(--accent)] text-white rounded-lg
                             hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
                >
                  {createLoading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          )}

          {/* Loading */}
          {loading && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-12 text-center">
              <p className="text-sm text-[var(--muted)]">Loading...</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && projects.length === 0 && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-12 text-center">
              <FolderOpen size={32} className="mx-auto text-[var(--muted)] mb-3" />
              <p className="text-[var(--muted)] mb-1">No projects yet.</p>
              <p className="text-sm text-[var(--muted)]">Create a project to organize tasks and track initiatives.</p>
            </div>
          )}

          {/* Project grid */}
          {!loading && projects.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map(project => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

function ProjectCard({ project }: { project: Project }) {
  const status = project.metadata?.status ?? 'active'
  const statusConfig = STATUS_CONFIG[status] ?? STATUS_CONFIG.active
  const description = project.metadata?.description

  return (
    <a
      href={`/projects/${project.id}`}
      className="block bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5
                 hover:border-[var(--accent)]/40 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h2 className="text-sm font-bold text-[var(--text)] group-hover:text-[var(--accent)] transition-colors leading-snug">
          {project.name}
        </h2>
        <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${statusConfig.className}`}>
          {statusConfig.label}
        </span>
      </div>

      {description && (
        <p className="text-xs text-[var(--muted)] mb-3 line-clamp-2 leading-relaxed">
          {description}
        </p>
      )}

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
        <span className="text-xs text-[var(--muted)]">
          {project.task_counts.open > 0 || project.task_counts.done > 0
            ? `${project.task_counts.open} open / ${project.task_counts.done} done`
            : 'No tasks yet'}
        </span>
        <span className="text-xs text-[var(--muted)]">
          {formatDate(project.last_seen)}
        </span>
      </div>
    </a>
  )
}
