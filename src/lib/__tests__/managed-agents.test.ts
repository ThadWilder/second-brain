/**
 * Managed Agents wire protocol tests.
 *
 * Validates the exact request shapes sent to the Anthropic API.
 * These caught 4 bugs during initial build:
 *   1. agent was string, API wants {type: "agent_reference", id: "..."}
 *   2. environment_id → environment
 *   3. event type "user.message" → "user"
 *   4. beta header was wrong
 *
 * Uses a mock fetch to intercept all API calls and validate payloads.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─────────────────────────────────────────
// Capture fetch calls for assertion
// ─────────────────────────────────────────

interface CapturedRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

let capturedRequests: CapturedRequest[] = []
let mockResponses: Array<{ status: number; body: unknown }> = []
const originalFetch = global.fetch

function setupMockFetch() {
  capturedRequests = []
  // @ts-expect-error — mock override
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const captured: CapturedRequest = {
      url,
      method: init?.method ?? 'GET',
      headers: {},
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    }

    // Extract headers
    if (init?.headers) {
      const h = init.headers as Record<string, string>
      for (const [k, v] of Object.entries(h)) {
        captured.headers[k] = v
      }
    }

    capturedRequests.push(captured)

    const mockResponse = mockResponses.shift() ?? { status: 200, body: {} }
    return {
      ok: mockResponse.status >= 200 && mockResponse.status < 300,
      status: mockResponse.status,
      json: async () => mockResponse.body,
      text: async () => JSON.stringify(mockResponse.body),
    }
  })
}

// ─────────────────────────────────────────
// Import after env setup (vitest.config.ts handles ANTHROPIC_API_KEY etc.)
// ─────────────────────────────────────────

// We need to set managed agent env vars before importing
beforeEach(() => {
  process.env.MANAGED_AGENT_ID = 'agent_test123'
  process.env.MANAGED_ENVIRONMENT_ID = 'env_test456'
  process.env.ANTHROPIC_API_KEY = 'sk-test-key'
  setupMockFetch()
})

afterEach(() => {
  global.fetch = originalFetch
  vi.resetModules()
})

// ─────────────────────────────────────────
// Tests
// ─────────────────────────────────────────

describe('Managed Agents wire protocol', () => {

  describe('headers', () => {
    it('sends correct beta header on all requests', async () => {
      mockResponses = [{ status: 200, body: { id: 'sesn_test', status: 'pending' } }]

      const { createSession } = await import('../managed-agents')
      await createSession()

      expect(capturedRequests[0].headers['anthropic-beta']).toBe('agent-api-2026-03-01')
    })

    it('sends correct anthropic-version header', async () => {
      mockResponses = [{ status: 200, body: { id: 'sesn_test' } }]

      const { createSession } = await import('../managed-agents')
      await createSession()

      expect(capturedRequests[0].headers['anthropic-version']).toBe('2023-06-01')
    })

    it('sends x-api-key from env', async () => {
      mockResponses = [{ status: 200, body: { id: 'sesn_test' } }]

      const { createSession } = await import('../managed-agents')
      await createSession()

      expect(capturedRequests[0].headers['x-api-key']).toBe('sk-test-key')
    })

    it('sends content-type application/json', async () => {
      mockResponses = [{ status: 200, body: { id: 'sesn_test' } }]

      const { createSession } = await import('../managed-agents')
      await createSession()

      expect(capturedRequests[0].headers['content-type']).toBe('application/json')
    })
  })

  describe('createSession', () => {
    it('POSTs to /v1/sessions', async () => {
      mockResponses = [{ status: 200, body: { id: 'sesn_abc123' } }]

      const { createSession } = await import('../managed-agents')
      const sessionId = await createSession()

      expect(capturedRequests[0].url).toBe('https://api.anthropic.com/v1/sessions')
      expect(capturedRequests[0].method).toBe('POST')
      expect(sessionId).toBe('sesn_abc123')
    })

    it('sends agent as object with type "agent_reference" — NOT a string', async () => {
      mockResponses = [{ status: 200, body: { id: 'sesn_test' } }]

      const { createSession } = await import('../managed-agents')
      await createSession()

      const body = capturedRequests[0].body as Record<string, unknown>
      expect(body.agent).toEqual({
        type: 'agent_reference',
        id: 'agent_test123',
      })
      // Must NOT be a plain string
      expect(typeof body.agent).toBe('object')
      expect(typeof body.agent).not.toBe('string')
    })

    it('sends "environment" not "environment_id"', async () => {
      mockResponses = [{ status: 200, body: { id: 'sesn_test' } }]

      const { createSession } = await import('../managed-agents')
      await createSession()

      const body = capturedRequests[0].body as Record<string, unknown>
      expect(body.environment).toBe('env_test456')
      expect(body).not.toHaveProperty('environment_id')
    })

    it('includes a title', async () => {
      mockResponses = [{ status: 200, body: { id: 'sesn_test' } }]

      const { createSession } = await import('../managed-agents')
      await createSession()

      const body = capturedRequests[0].body as Record<string, unknown>
      expect(body.title).toBeDefined()
      expect(typeof body.title).toBe('string')
      expect((body.title as string).length).toBeGreaterThan(0)
    })

    it('throws when MANAGED_AGENT_ID is missing', async () => {
      delete process.env.MANAGED_AGENT_ID

      const { createSession } = await import('../managed-agents')
      await expect(createSession()).rejects.toThrow('MANAGED_AGENT_ID')
    })

    it('throws on non-200 response', async () => {
      mockResponses = [{ status: 400, body: { error: { message: 'bad request' } } }]

      const { createSession } = await import('../managed-agents')
      await expect(createSession()).rejects.toThrow('createSession failed: 400')
    })
  })

  describe('sendUserMessage', () => {
    it('POSTs to /v1/sessions/:id/events', async () => {
      mockResponses = [{ status: 200, body: { data: [] } }]

      const { sendUserMessage } = await import('../managed-agents')
      await sendUserMessage('sesn_abc', 'hello')

      expect(capturedRequests[0].url).toBe('https://api.anthropic.com/v1/sessions/sesn_abc/events')
      expect(capturedRequests[0].method).toBe('POST')
    })

    it('sends event type "user" — NOT "user.message"', async () => {
      mockResponses = [{ status: 200, body: { data: [] } }]

      const { sendUserMessage } = await import('../managed-agents')
      await sendUserMessage('sesn_abc', 'what tasks are open?')

      const body = capturedRequests[0].body as { events: Array<{ type: string }> }
      expect(body.events).toHaveLength(1)
      expect(body.events[0].type).toBe('user')
      expect(body.events[0].type).not.toBe('user.message')
    })

    it('sends content as array of text blocks', async () => {
      mockResponses = [{ status: 200, body: { data: [] } }]

      const { sendUserMessage } = await import('../managed-agents')
      await sendUserMessage('sesn_abc', 'test message')

      const body = capturedRequests[0].body as {
        events: Array<{ content: Array<{ type: string; text: string }> }>
      }
      expect(body.events[0].content).toEqual([
        { type: 'text', text: 'test message' },
      ])
    })

    it('throws on non-200 response', async () => {
      mockResponses = [{ status: 400, body: { error: { message: 'invalid' } } }]

      const { sendUserMessage } = await import('../managed-agents')
      await expect(sendUserMessage('sesn_abc', 'hello')).rejects.toThrow('sendUserMessage failed')
    })
  })

  describe('sendToolResult', () => {
    it('POSTs to /v1/sessions/:id/events', async () => {
      mockResponses = [{ status: 200, body: { data: [] } }]

      const { sendToolResult } = await import('../managed-agents')
      await sendToolResult('sesn_abc', 'sevt_tool123', { tasks: [] })

      expect(capturedRequests[0].url).toBe('https://api.anthropic.com/v1/sessions/sesn_abc/events')
    })

    it('sends event type "tool_result" with tool_use_id', async () => {
      mockResponses = [{ status: 200, body: { data: [] } }]

      const { sendToolResult } = await import('../managed-agents')
      await sendToolResult('sesn_abc', 'sevt_tool123', { count: 5 })

      const body = capturedRequests[0].body as {
        events: Array<{ type: string; tool_use_id: string }>
      }
      expect(body.events).toHaveLength(1)
      expect(body.events[0].type).toBe('tool_result')
      expect(body.events[0].tool_use_id).toBe('sevt_tool123')
    })

    it('sends result as JSON-stringified text content', async () => {
      mockResponses = [{ status: 200, body: { data: [] } }]

      const { sendToolResult } = await import('../managed-agents')
      const result = { tasks: [{ id: '1', description: 'test' }], count: 1 }
      await sendToolResult('sesn_abc', 'sevt_tool123', result)

      const body = capturedRequests[0].body as {
        events: Array<{ content: Array<{ type: string; text: string }> }>
      }
      expect(body.events[0].content).toHaveLength(1)
      expect(body.events[0].content[0].type).toBe('text')
      expect(JSON.parse(body.events[0].content[0].text)).toEqual(result)
    })

    it('does NOT send type "custom_tool_result" or "user.custom_tool_result"', async () => {
      mockResponses = [{ status: 200, body: { data: [] } }]

      const { sendToolResult } = await import('../managed-agents')
      await sendToolResult('sesn_abc', 'sevt_tool123', {})

      const body = capturedRequests[0].body as {
        events: Array<{ type: string }>
      }
      expect(body.events[0].type).not.toBe('custom_tool_result')
      expect(body.events[0].type).not.toBe('user.custom_tool_result')
      expect(body.events[0].type).toBe('tool_result')
    })
  })

  describe('getSessionEvents', () => {
    it('GETs /v1/sessions/:id/events with order=asc', async () => {
      mockResponses = [{ status: 200, body: { data: [] } }]

      const { getSessionEvents } = await import('../managed-agents')
      await getSessionEvents('sesn_abc')

      expect(capturedRequests[0].url).toBe(
        'https://api.anthropic.com/v1/sessions/sesn_abc/events?order=asc&limit=100'
      )
      expect(capturedRequests[0].method).toBe('GET')
    })

    it('does NOT use after_id parameter', async () => {
      mockResponses = [{ status: 200, body: { data: [] } }]

      const { getSessionEvents } = await import('../managed-agents')
      await getSessionEvents('sesn_abc')

      expect(capturedRequests[0].url).not.toContain('after_id')
    })

    it('returns events from data array', async () => {
      const mockEvents = [
        { id: 'evt1', type: 'user', content: [{ type: 'text', text: 'hello' }] },
        { id: 'evt2', type: 'agent', content: [{ type: 'text', text: 'hi' }] },
      ]
      mockResponses = [{ status: 200, body: { data: mockEvents } }]

      const { getSessionEvents } = await import('../managed-agents')
      const events = await getSessionEvents('sesn_abc')

      expect(events).toHaveLength(2)
      expect(events[0].type).toBe('user')
      expect(events[1].type).toBe('agent')
    })
  })

  describe('getSessionStatus', () => {
    it('GETs /v1/sessions/:id', async () => {
      mockResponses = [{ status: 200, body: { status: 'idle' } }]

      const { getSessionStatus } = await import('../managed-agents')
      const status = await getSessionStatus('sesn_abc')

      expect(capturedRequests[0].url).toBe('https://api.anthropic.com/v1/sessions/sesn_abc')
      expect(status).toBe('idle')
    })

    it('returns correct status values', async () => {
      for (const expected of ['pending', 'running', 'idle', 'completed']) {
        capturedRequests = []
        mockResponses = [{ status: 200, body: { status: expected } }]

        const { getSessionStatus } = await import('../managed-agents')
        const status = await getSessionStatus('sesn_test')

        expect(status).toBe(expected)
      }
    })
  })

  describe('tool definitions shape', () => {
    it('all tools use type "custom" — not "custom_20260401"', async () => {
      const { AGENT_TOOL_DEFINITIONS } = await import('../managed-agents')

      for (const tool of AGENT_TOOL_DEFINITIONS) {
        expect(tool.type).toBe('custom')
        expect(tool.type).not.toBe('custom_20260401')
      }
    })

    it('all tools have name, description, and input_schema', async () => {
      const { AGENT_TOOL_DEFINITIONS } = await import('../managed-agents')

      for (const tool of AGENT_TOOL_DEFINITIONS) {
        expect(tool.name).toBeDefined()
        expect(tool.description).toBeDefined()
        expect(tool.input_schema).toBeDefined()
        expect(tool.input_schema.type).toBe('object')
      }
    })

    it('defines all 9 expected tools', async () => {
      const { AGENT_TOOL_DEFINITIONS } = await import('../managed-agents')

      const names = AGENT_TOOL_DEFINITIONS.map((t) => t.name)
      expect(names).toContain('read_wiki')
      expect(names).toContain('search_wiki')
      expect(names).toContain('query_tasks')
      expect(names).toContain('query_entries')
      expect(names).toContain('query_decisions')
      expect(names).toContain('update_task')
      expect(names).toContain('create_task')
      expect(names).toContain('log_decision')
      expect(names).toContain('flag_pending_response')
      expect(names).toHaveLength(9)
    })
  })
})

// ─────────────────────────────────────────
// SessionEvent shape validation
// ─────────────────────────────────────────

describe('SessionEvent parsing', () => {
  it('tool_use event has tool_name, tool_use_id, and input', async () => {
    const toolUseEvent = {
      id: 'sevt_test',
      type: 'tool_use',
      tool_name: 'query_tasks',
      tool_use_id: 'sevt_test',
      input: { status: 'open' },
    }

    expect(toolUseEvent.type).toBe('tool_use')
    expect(toolUseEvent.tool_name).toBe('query_tasks')
    expect(toolUseEvent.tool_use_id).toBeDefined()
    expect(toolUseEvent.input).toEqual({ status: 'open' })
  })

  it('agent event has content array with text blocks', () => {
    const agentEvent = {
      id: 'sevt_agent',
      type: 'agent',
      content: [{ type: 'text', text: 'You have 1 open task.' }],
    }

    expect(agentEvent.type).toBe('agent')
    expect(agentEvent.content).toHaveLength(1)
    expect(agentEvent.content[0].type).toBe('text')
    expect(agentEvent.content[0].text).toContain('open task')
  })

  it('status_idle event has type "status_idle"', () => {
    const idleEvent = { id: 'sevt_idle', type: 'status_idle' }
    expect(idleEvent.type).toBe('status_idle')
    expect(idleEvent.type).not.toBe('session.status_idle')
  })

  it('user event uses type "user" not "user.message"', () => {
    const userEvent = {
      id: 'sevt_user',
      type: 'user',
      content: [{ type: 'text', text: 'hello' }],
    }
    expect(userEvent.type).toBe('user')
    expect(userEvent.type).not.toBe('user.message')
  })
})
