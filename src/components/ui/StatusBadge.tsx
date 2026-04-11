'use client'

import { clsx } from 'clsx'

type Status = 'open' | 'done' | 'blocked' | 'tracking' | 'dismissed'

const STATUS_STYLES: Record<Status, string> = {
  open: 'bg-blue-50 text-blue-700 border-blue-200',
  done: 'bg-green-50 text-green-700 border-green-200',
  blocked: 'bg-red-50 text-red-700 border-red-200',
  tracking: 'bg-purple-50 text-purple-700 border-purple-200',
  dismissed: 'bg-gray-50 text-gray-600 border-gray-200',
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
        STATUS_STYLES[status] ?? 'bg-gray-50 text-gray-600 border-gray-200'
      )}
    >
      {status}
    </span>
  )
}
