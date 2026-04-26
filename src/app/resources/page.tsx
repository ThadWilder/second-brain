'use client'

import { useState } from 'react'
import { Header } from '@/components/ui/Header'
import { BookOpen, Link2 } from 'lucide-react'
import dynamic from 'next/dynamic'

const LinksTab = dynamic(() => import('@/components/resources/LinksTab'), { loading: () => <TabLoading /> })
const WikiTab = dynamic(() => import('@/components/resources/WikiTab'), { loading: () => <TabLoading /> })

function TabLoading() {
  return (
    <div className="flex items-center justify-center py-20">
      <p className="text-sm text-[var(--muted)]">Loading...</p>
    </div>
  )
}

type Tab = 'links' | 'wiki'

const TABS: Array<{ id: Tab; label: string; icon: typeof BookOpen }> = [
  { id: 'links', label: 'Links & Receipts', icon: Link2 },
  { id: 'wiki', label: 'Wiki', icon: BookOpen },
]

export default function ResourcesPage() {
  const [activeTab, setActiveTab] = useState<Tab>('links')

  return (
    <div className="min-h-screen flex flex-col">
      <Header activePage="resources" />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1100px] mx-auto px-4 py-8">
          {/* Page title */}
          <h1 className="text-xl font-bold text-[var(--text)] mb-6">Resources</h1>

          {/* Tab bar */}
          <div className="flex gap-1 border-b border-[var(--border)] mb-6">
            {TABS.map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    isActive
                      ? 'border-[var(--accent)] text-[var(--accent)]'
                      : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  <Icon size={15} />
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Tab content */}
          {activeTab === 'links' && <LinksTab />}
          {activeTab === 'wiki' && <WikiTab />}
        </div>
      </div>
    </div>
  )
}
