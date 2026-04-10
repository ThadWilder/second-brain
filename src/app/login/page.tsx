'use client'

import { createClient } from '@/lib/supabase/browser'
import { useState, useEffect } from 'react'
import Image from 'next/image'

const taglines = [
  'dump everything. forget nothing. 🥟',
  'your brain called. it wants a break. 🥟',
  'chaos in, clarity out. 🥟',
  'think less. dump more. 🥟',
  'remember everything. organize nothing. 🥟',
]

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [taglineIndex, setTaglineIndex] = useState(0)
  const [fade, setFade] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setTaglineIndex((i) => (i + 1) % taglines.length)
        setFade(true)
      }, 400)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  async function handleGoogleLogin() {
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md mx-auto">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <Image src="/logo-icon.png" alt="Dumpbox" width={120} height={120} className="" />
          </div>
          <h1 className="text-5xl sm:text-6xl font-black tracking-tighter text-[var(--text)] mb-4">
            DUMPBOX
          </h1>
          <p
            className={`text-lg text-[var(--accent)] italic transition-opacity duration-400 ${fade ? 'opacity-100' : 'opacity-0'}`}
          >
            {taglines[taglineIndex]}
          </p>
        </div>

        {/* One-liners */}
        <div className="space-y-3 mb-10 text-sm text-[var(--muted)]">
          <p>
            <span className="text-[var(--text)]">Forward an email.</span>{' '}
            We&apos;ll figure it out.
          </p>
          <p>
            <span className="text-[var(--text)]">Paste a screenshot.</span>{' '}
            We&apos;ll read it.
          </p>
          <p>
            <span className="text-[var(--text)]">Type a thought.</span>{' '}
            We&apos;ll remember it.
          </p>
          <p>
            <span className="text-[var(--text)]">Ask a question.</span>{' '}
            We&apos;ll know the answer.
          </p>
        </div>

        {/* Sign in */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white text-gray-800 font-semibold text-sm px-4 py-3 rounded-lg border border-[var(--border)] hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          {loading ? 'Redirecting...' : 'Sign in with Google'}
        </button>

        {error && (
          <p className="mt-4 text-sm text-[var(--danger)] text-center">{error}</p>
        )}

        <p className="mt-8 text-xs text-[var(--muted)] text-center">
          your personal chaos organizer — not enterprise software
        </p>
      </div>
    </div>
  )
}
