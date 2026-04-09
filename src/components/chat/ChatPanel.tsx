'use client'

import { useState, useEffect, useRef } from 'react'
import { ChatInput } from './ChatInput'
import { ChatMessage } from './ChatMessage'
import type { ChatMessage as ChatMessageType } from '@/types'

export function ChatPanel() {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessageType[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Initialize session on mount
  useEffect(() => {
    initSession()
  }, [])

  async function initSession() {
    try {
      const res = await fetch('/api/chat/session', { method: 'POST' })
      const data = await res.json()
      if (data.conversation_id) {
        setConversationId(data.conversation_id)
        setSessionId(data.session_id)
      }
    } catch {
      setError('Failed to start chat session')
    }
  }

  async function sendMessage(text: string) {
    if (!conversationId || isStreaming) return

    setError(null)
    const userMsg: ChatMessageType = {
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])

    // Add streaming placeholder
    const streamingMsg: ChatMessageType = {
      role: 'assistant',
      content: '',
      isStreaming: true,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, streamingMsg])
    setIsStreaming(true)

    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/chat/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, message: text }),
        signal: abortRef.current.signal,
      })

      if (!res.body) throw new Error('No response stream')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6))
              handleSSEEvent(event)
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError('Chat error. Please try again.')
        // Remove streaming placeholder
        setMessages((prev) => prev.filter((m) => !m.isStreaming))
      }
    } finally {
      setIsStreaming(false)
      // Mark streaming done
      setMessages((prev) =>
        prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
      )
    }
  }

  function handleSSEEvent(event: { type: string; [key: string]: unknown }) {
    switch (event.type) {
      case 'content_delta':
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (!last || last.role !== 'assistant') return prev
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + (event.delta as string) },
          ]
        })
        break
      case 'message_stop':
        setMessages((prev) =>
          prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
        )
        break
      case 'error':
        setError(event.message as string)
        break
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="text-center py-4 text-slate-500 text-sm">
            <p>Ask a question or dump info.</p>
            <p className="text-xs mt-1 text-slate-600">
              e.g. "what's blocked at Miracle Method" or paste an email
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}
        {error && (
          <div className="text-xs text-red-400 px-3 py-2 bg-red-500/10 rounded-lg border border-red-500/20">
            {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-2">
        <ChatInput
          onSend={sendMessage}
          disabled={isStreaming || !conversationId}
          placeholder={
            !conversationId
              ? 'Starting session...'
              : 'Ask a question or dump info...'
          }
        />
        {isStreaming && (
          <p className="text-[10px] text-slate-500 mt-1 text-center">
            thinking...
          </p>
        )}
      </div>
    </div>
  )
}
