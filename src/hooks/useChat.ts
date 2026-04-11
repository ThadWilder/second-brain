'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { ChatMessage as ChatMessageType, Attachment, IngestResult } from '@/types'

/** Simple heuristic: if the text looks like a question, route to chat; otherwise ingest. */
function looksLikeQuestion(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.endsWith('?')) return true
  const lower = trimmed.toLowerCase()
  const questionStarts = ['what', 'who', 'where', 'when', 'why', 'how', 'is ', 'are ', 'can ', 'do ', 'does ', 'did ', 'will ', 'should ', 'could ', 'would ', 'show me', 'tell me', 'list ']
  return questionStarts.some((q) => lower.startsWith(q))
}

function buildIngestSummary(result: IngestResult): string {
  const parts: string[] = []
  if (result.tasks_created > 0) parts.push(`${result.tasks_created} task${result.tasks_created !== 1 ? 's' : ''}`)
  if (result.decisions_created > 0) parts.push(`${result.decisions_created} decision${result.decisions_created !== 1 ? 's' : ''}`)
  if (result.pending_responses_created > 0) parts.push(`${result.pending_responses_created} pending response${result.pending_responses_created !== 1 ? 's' : ''}`)
  if (result.entities_created > 0) parts.push(`${result.entities_created} new entit${result.entities_created !== 1 ? 'ies' : 'y'}`)
  if (result.entities_resolved > 0) parts.push(`linked to ${result.entities_resolved} entit${result.entities_resolved !== 1 ? 'ies' : 'y'}`)
  if (parts.length === 0) return '🥟 Dumpling processed — no new items extracted.'
  return `🥟 Dumpling processed — ${parts.join(', ')}.`
}

interface UseChatOptions {
  showToast: (toast: { type: 'success' | 'error'; message: string; action?: { label: string; onClick: () => void } }) => void
  fetchData: () => void
}

export function useChat({ showToast, fetchData }: UseChatOptions) {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessageType[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [isIngesting, setIsIngesting] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Initialize chat session on mount
  useEffect(() => {
    fetch('/api/chat/session', { method: 'POST' })
      .then((res) => res.json())
      .then((data) => {
        if (data.conversation_id) setConversationId(data.conversation_id)
      })
      .catch(() => {})
  }, [])

  /** Send to ingest API */
  const sendToIngest = useCallback(async (text: string, attachments?: Attachment[]) => {
    setIsIngesting(true)
    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          source: 'paste',
          attachments: attachments ?? [],
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Ingest failed' }))
        showToast({ type: 'error', message: err.error || 'Ingest failed' })
        return
      }
      const result: IngestResult = await res.json()
      if (result.tasks_created !== undefined) {
        const summary = buildIngestSummary(result)
        showToast({
          type: 'success',
          message: summary,
          action: result.tasks_created > 0
            ? { label: 'View', onClick: () => {
                document.getElementById('priorities-section')?.scrollIntoView({ behavior: 'smooth' })
              }}
            : result.decisions_created > 0
            ? { label: 'View', onClick: () => {
                document.getElementById('entity-cards-section')?.scrollIntoView({ behavior: 'smooth' })
              }}
            : undefined,
        })
        // Refresh dashboard data after ingest
        fetchData()
      }
    } catch {
      showToast({ type: 'error', message: 'Failed to submit — check your connection.' })
    } finally {
      setIsIngesting(false)
    }
  }, [showToast, fetchData])

  /** Handle SSE events from the chat stream */
  const handleSSEEvent = useCallback((event: { type: string; [key: string]: unknown }) => {
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
        showToast({ type: 'error', message: event.message as string })
        break
    }
  }, [showToast])

  /** Send to chat API */
  const sendToChat = useCallback(async (text: string, attachments?: Attachment[]) => {
    if (!conversationId || isStreaming) return

    const userMsg: ChatMessageType = {
      role: 'user',
      content: text,
      attachments,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])

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
        body: JSON.stringify({
          conversation_id: conversationId,
          message: text,
          attachments: attachments ?? [],
        }),
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
        setMessages((prev) => prev.filter((m) => !m.isStreaming))
      }
    } finally {
      setIsStreaming(false)
      setMessages((prev) =>
        prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
      )
    }
  }, [conversationId, isStreaming, handleSSEEvent])

  /** Route message: question -> chat, raw content -> ingest */
  const handleSend = useCallback((text: string, attachments?: Attachment[]) => {
    if (looksLikeQuestion(text) && !attachments?.length) {
      sendToChat(text, attachments)
    } else {
      sendToIngest(text, attachments)
    }
  }, [sendToChat, sendToIngest])

  function dismissMessage(index: number) {
    setMessages((prev) => prev.filter((_, i) => i !== index))
  }

  // Show last 5 assistant responses for the inline response row
  const recentResponses = messages
    .filter((m) => m.role === 'assistant' && m.content && !m.isStreaming)
    .slice(-5)

  // Active streaming message
  const streamingMessage = messages.find((m) => m.isStreaming)

  return {
    conversationId,
    messages,
    isStreaming,
    isIngesting,
    streamingMessage,
    recentResponses,
    messagesEndRef,
    handleSend,
    dismissMessage,
  }
}
