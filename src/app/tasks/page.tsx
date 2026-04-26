'use client'

import { useState, useEffect, useCallback } from 'react'
import { Header } from '@/components/ui/Header'
import { Priorities } from '@/components/dashboard/Priorities'
import { useToast, ToastProvider } from '@/components/ui/Toast'

const POLL_INTERVAL = 60_000

function TasksContent() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
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
