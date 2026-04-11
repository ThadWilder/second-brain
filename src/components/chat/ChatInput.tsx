'use client'

import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { Send, ImageIcon } from 'lucide-react'
import type { Attachment } from '@/types'

interface Props {
  onSend: (message: string, attachments?: Attachment[]) => void
  disabled?: boolean
  placeholder?: string
  autoFocus?: boolean
  large?: boolean
}

const ACCEPT = 'image/png,image/jpeg,image/jpg,image/gif,image/webp'

export function ChatInput({ onSend, disabled, placeholder, autoFocus, large }: Props) {
  const [value, setValue] = useState('')
  const [pendingFiles, setPendingFiles] = useState<Array<{ file: File; preview: string }>>([])
  const [uploading, setUploading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [autoFocus])

  async function uploadFile(file: File): Promise<Attachment | null> {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: form })
    if (!res.ok) return null
    return res.json()
  }

  async function handleSend() {
    const text = value.trim()
    if ((!text && pendingFiles.length === 0) || disabled || uploading) return

    let attachments: Attachment[] | undefined
    if (pendingFiles.length > 0) {
      setUploading(true)
      const results = await Promise.all(pendingFiles.map((pf) => uploadFile(pf.file)))
      attachments = results.filter((a): a is Attachment => a !== null)
      setUploading(false)

      // Clean up object URLs
      pendingFiles.forEach((pf) => URL.revokeObjectURL(pf.preview))
      setPendingFiles([])
    }

    onSend(text, attachments)
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
    const maxH = large ? 240 : 160
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    const newFiles = Array.from(files).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }))
    setPendingFiles((prev) => [...prev, ...newFiles])
    // Reset input so the same file can be re-selected
    e.target.value = ''
  }

  function removeFile(index: number) {
    setPendingFiles((prev) => {
      URL.revokeObjectURL(prev[index].preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  return (
    <div className={`${large ? 'p-0' : 'bg-[var(--surface)] border border-[var(--border)] rounded-xl p-2'}`}>
      {/* Image previews */}
      {pendingFiles.length > 0 && (
        <div className="flex gap-2 px-1 pb-2 overflow-x-auto">
          {pendingFiles.map((pf, i) => (
            <div key={i} className="relative shrink-0 group">
              <img
                src={pf.preview}
                alt={pf.file.name}
                className="w-16 h-16 object-cover rounded-lg border border-[var(--border)]"
              />
              <button
                onClick={() => removeFile(i)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[var(--danger)] rounded-full
                           flex items-center justify-center text-[8px] text-white
                           opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label={`Remove ${pf.file.name}`}
              >
                x
              </button>
              <p className="text-[8px] text-[var(--muted)] text-center mt-0.5 max-w-[64px] truncate">
                {pf.file.name}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          disabled={disabled || uploading}
          placeholder={placeholder ?? 'Ask a question or dump info...'}
          rows={large ? 2 : 1}
          className={`flex-1 bg-transparent resize-none text-[var(--text)] placeholder:text-[var(--muted)]
                     focus:outline-none leading-relaxed
                     disabled:opacity-50
                     ${large ? 'text-base py-2 min-h-[56px] max-h-[240px]' : 'text-sm py-1 min-h-[32px] max-h-[160px]'}`}
        />
        {/* File upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          className={`shrink-0 flex items-center justify-center rounded-lg
                     text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]
                     disabled:opacity-40 disabled:cursor-not-allowed transition-colors
                     ${large ? 'w-10 h-10' : 'w-8 h-8'}`}
          aria-label="Attach image"
        >
          <ImageIcon className={large ? 'w-5 h-5' : 'w-4 h-4'} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          onClick={handleSend}
          disabled={disabled || uploading || (!value.trim() && pendingFiles.length === 0)}
          className={`shrink-0 flex items-center justify-center rounded-lg
                     bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed
                     transition-colors
                     ${large ? 'w-10 h-10' : 'w-8 h-8'}`}
          aria-label="Send"
        >
          {disabled || uploading ? (
            <span className={`border-2 border-white/30 border-t-white rounded-full animate-spin ${large ? 'w-4 h-4' : 'w-3.5 h-3.5'}`} />
          ) : (
            <Send className={`${large ? 'w-4 h-4' : 'w-3.5 h-3.5'} text-white`} />
          )}
        </button>
      </div>
      {large && (
        <div className="flex items-center gap-3 mt-1.5 px-1">
          <span className="text-[10px] text-[var(--muted)]">
            Prefix with <span className="font-mono bg-[var(--surface-hover)] px-1 rounded">FYI:</span> for context only or <span className="font-mono bg-[var(--surface-hover)] px-1 rounded">TRACK:</span> to monitor without owning
          </span>
        </div>
      )}
    </div>
  )
}
