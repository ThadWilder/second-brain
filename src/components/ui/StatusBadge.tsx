'use client'

import { clsx } from 'clsx'

type Status = 'open' | 'done' | 'blocked'

const STATUS_STYLES: Record<Status, string> = {
  open: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  done: 'bg-green-500/10 text-green-400 border-green-500/20',
  blocked: 'bg-red-500/10 text-red-400 border-red-500/20',
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
        STATUS_STYLES[status] ?? 'bg-gray-500/10 text-gray-400 border-gray-500/20'
      )}
    >
      {status}
    </span>
  )
}
