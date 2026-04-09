import Anthropic from '@anthropic-ai/sdk'

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export const CLAUDE_MODEL = 'claude-sonnet-4-5'

// Managed Agents config — set up once via `ant` CLI, IDs stored as env vars
export const MANAGED_AGENT_ID = process.env.MANAGED_AGENT_ID!
export const MANAGED_ENVIRONMENT_ID = process.env.MANAGED_ENVIRONMENT_ID!
