import Anthropic from '@anthropic-ai/sdk'

let _anthropic: Anthropic | null = null

export function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _anthropic
}

// Backwards compat
export const anthropic = new Proxy({} as Anthropic, {
  get(_target, prop) {
    return (getAnthropic() as unknown as Record<string, unknown>)[prop as string]
  },
})

export const CLAUDE_MODEL = 'claude-sonnet-4-5'
export const CLAUDE_MODEL_FAST = 'claude-haiku-4-5-20251001'
export const CLAUDE_MODEL_DEEP = 'claude-opus-4-6'

export const MANAGED_AGENT_ID = process.env.MANAGED_AGENT_ID ?? ''
export const MANAGED_ENVIRONMENT_ID = process.env.MANAGED_ENVIRONMENT_ID ?? ''
