'use client'

import { clsx } from 'clsx'
import type { ChatMessage as ChatMessageType } from '@/types'

interface Props {
  message: ChatMessageType
}

export function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user'
  const attachments = message.attachments ?? []

  return (
    <div className={clsx('flex gap-2.5', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-blue-600/20 border border-blue-600/30
                        flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-[10px] text-blue-400">AI</span>
        </div>
      )}

      <div
        className={clsx(
          'max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed',
          isUser
            ? 'bg-blue-600/20 border border-blue-600/30 text-slate-200'
            : 'bg-[#1a2035] border border-[#2a3150] text-slate-200',
          message.isStreaming && 'streaming-cursor'
        )}
      >
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachments.map((att, i) => (
              <a key={i} href={att.url} target="_blank" rel="noopener noreferrer">
                <img
                  src={att.url}
                  alt={att.filename}
                  className="max-w-[200px] max-h-[150px] rounded-lg border border-[#2a3150] object-cover"
                />
              </a>
            ))}
          </div>
        )}
        {message.content && (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        )}
        {message.created_at && (
          <p className="text-[10px] text-slate-500 mt-1">
            {new Date(message.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}
      </div>

      {isUser && (
        <div className="w-6 h-6 rounded-full bg-slate-700 border border-slate-600
                        flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-[10px] text-slate-300">B</span>
        </div>
      )}
    </div>
  )
}
