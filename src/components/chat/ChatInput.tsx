'use client'

import { useState, useRef, KeyboardEvent } from 'react'

interface Props {
  onSend: (message: string) => void
  disabled?: boolean
  placeholder?: string
}

export function ChatInput({ onSend, disabled, placeholder }: Props) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleSend() {
    const text = value.trim()
    if (!text || disabled) return
    onSend(text)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleInput() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  return (
    <div className="flex items-end gap-2 bg-[#1a1d27] border border-[#2a2d3a] rounded-xl p-2">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        disabled={disabled}
        placeholder={placeholder ?? 'Ask a question or dump info...'}
        rows={1}
        className="flex-1 bg-transparent resize-none text-sm text-slate-200 placeholder:text-slate-500
                   focus:outline-none leading-relaxed py-1 px-1 min-h-[32px] max-h-[160px]
                   disabled:opacity-50"
      />
      <button
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg
                   bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed
                   transition-colors"
        aria-label="Send"
      >
        {disabled ? (
          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 16 16" fill="none">
            <path d="M2 14L14 8L2 2v5l8 1-8 1v5z" fill="currentColor" />
          </svg>
        )}
      </button>
    </div>
  )
}
