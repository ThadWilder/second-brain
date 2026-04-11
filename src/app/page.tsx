'use client'

import { DashboardClient } from '@/components/dashboard/DashboardClient'

const EMPTY_DATA = {
  stats: { escalations: 0, needs_response: 0, open_tasks: 0, closed_7d: 0, waiting_on: 0, dumplings_this_week: 0 },
  brands: [], people: [], vendors: [], departments: [], franchisees: [], vendorTeam: [], freelancers: [],
  escalatedTasks: [], overdueTasks: [], regularTasks: [], inboxTasks: [],
  overdueFollowUps: [], staleTracking: [],
  pendingResponses: [], needsReplyTaskIds: [], clarifications: [],
  consolidationSuggestions: [], consolidationTaskIds: [],
  heatmapCells: [], heatmapDays: [], brandNames: [], allEntities: [],
  entityRelationships: [],
}

export default function DashboardPage() {
  // Start with empty data — DashboardClient polls immediately on mount
  return <DashboardClient initialData={EMPTY_DATA as any} />
}
