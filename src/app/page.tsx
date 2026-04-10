'use client'

import { DashboardClient } from '@/components/dashboard/DashboardClient'

const EMPTY_DATA = {
  stats: { escalations: 0, needs_response: 0, open_tasks: 0, closed_7d: 0 },
  brands: [], people: [], vendors: [], departments: [], franchisees: [], vendorTeam: [], freelancers: [],
  escalatedTasks: [], regularTasks: [], staleFromYesterday: [],
  pendingResponses: [], clarifications: [],
  heatmapCells: [], heatmapDays: [], brandNames: [], allEntities: [],
}

export default function DashboardPage() {
  // Start with empty data — DashboardClient polls immediately on mount
  return <DashboardClient initialData={EMPTY_DATA as any} />
}
