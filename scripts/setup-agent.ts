/**
 * One-time setup script — run once to create the Managed Agent and Environment.
 *
 * Usage:
 *   npx tsx scripts/setup-agent.ts
 *
 * Outputs:
 *   MANAGED_AGENT_ID=agt_xxx
 *   MANAGED_ENVIRONMENT_ID=env_xxx
 *
 * Paste these into your .env.local
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createAgent, createEnvironment } from '../src/lib/managed-agents'

async function main() {
  console.log('Creating Managed Agent...')
  const agentId = await createAgent()
  console.log(`✓ Agent created: ${agentId}`)

  console.log('Creating Environment...')
  const envId = await createEnvironment()
  console.log(`✓ Environment created: ${envId}`)

  console.log('\nAdd these to your .env.local:\n')
  console.log(`MANAGED_AGENT_ID=${agentId}`)
  console.log(`MANAGED_ENVIRONMENT_ID=${envId}`)
}

main().catch((err) => {
  console.error('Setup failed:', err.message)
  process.exit(1)
})
