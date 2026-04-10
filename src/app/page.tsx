export const dynamic = 'force-dynamic'

import { DashboardClient } from '@/components/dashboard/DashboardClient'

export default async function DashboardPage() {
  // Fetch initial data server-side for fast first paint
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  let initialData

  try {
    const res = await fetch(`${baseUrl}/api/dashboard`, { cache: 'no-store' })
    initialData = await res.json()
  } catch {
    // Fallback empty data if API fails during SSR
    initialData = {
      stats: { escalations: 0, needs_response: 0, open_tasks: 0, closed_7d: 0 },
      brands: [], people: [], vendors: [],
      escalatedTasks: [], regularTasks: [], staleFromYesterday: [],
      pendingResponses: [], clarifications: [],
      heatmapCells: [], heatmapDays: [], brandNames: [], allEntities: [],
    }
  }

  return <DashboardClient initialData={initialData} />
}
