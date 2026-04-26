'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Clock, Link2, FolderOpen, BookOpen, BarChart3, CheckSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase/browser'

type PageId = 'dashboard' | 'resources' | 'projects' | 'wiki' | 'history' | 'kpis' | 'audits' | 'reviews' | 'tags'

const NAV_ITEMS: Array<{ id: PageId; label: string; href: string; icon?: typeof Clock; small?: boolean }> = [
  { id: 'dashboard', label: 'Tasks', href: '/', icon: CheckSquare },
  { id: 'projects', label: 'Projects', href: '/projects', icon: FolderOpen },
  { id: 'resources', label: 'Resources', href: '/resources', icon: BookOpen },
  { id: 'kpis', label: 'KPIs', href: '/kpis', icon: BarChart3 },
  { id: 'history', label: 'History', href: '/history', icon: Clock, small: true },
]

const PAGE_LABELS: Record<PageId, { label: string; icon?: typeof Clock }> = {
  dashboard: { label: 'Dashboard' },
  resources: { label: 'Resources', icon: BookOpen },
  projects: { label: 'Projects', icon: FolderOpen },
  wiki: { label: 'Wiki' },
  history: { label: 'History', icon: Clock },
  kpis: { label: 'KPIs', icon: BarChart3 },
  audits: { label: 'Audits' },
  reviews: { label: 'Reviews' },
  tags: { label: 'Tags' },
}

export function Header({ activePage }: { activePage: PageId }) {
  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const pageInfo = PAGE_LABELS[activePage]
  const PageIcon = pageInfo?.icon

  return (
    <header className="bg-[#2c2014] px-6 py-4 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        <Link href="/">
          <Image src="/logo-icon-white.png" alt="Dumpbox" width={32} height={32} />
        </Link>
        <Link href="/" className="text-white font-bold tracking-tight text-lg hover:text-white/90 transition-colors">
          Dumpbox
        </Link>
        {activePage !== 'dashboard' && (
          <>
            <span className="text-white/20 select-none">/</span>
            <span className="text-sm text-white/70 flex items-center gap-1.5">
              {PageIcon && <PageIcon size={14} />}
              {pageInfo.label}
            </span>
          </>
        )}
      </div>
      <nav className="flex items-center gap-6">
        {NAV_ITEMS.map(item => {
          const isActive = item.id === activePage
          const Icon = item.icon
          return (
            <a
              key={item.id}
              href={item.href}
              className={`font-medium transition-colors flex items-center gap-1.5 ${
                item.small ? 'text-sm' : 'text-base'
              } ${
                isActive ? 'text-white' : (item.small ? 'text-white/50 hover:text-white' : 'text-white/70 hover:text-white')
              }`}
            >
              {Icon && <Icon size={item.small ? 13 : 15} />}
              {item.label}
            </a>
          )
        })}
        <button
          onClick={handleSignOut}
          className="text-base text-white/70 font-medium hover:text-white transition-colors"
        >
          Sign out
        </button>
      </nav>
    </header>
  )
}
