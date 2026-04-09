/**
 * POST /api/chat/session
 *
 * Create a new Managed Agent session and persist a conversation record.
 * Returns: { conversation_id, session_id }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { createAgentSession } from '@/lib/managed-agents'

export async function POST(_req: NextRequest): Promise<NextResponse> {
  try {
    const sessionId = await createAgentSession()
    const db = getServiceClient()

    const { data: conversation, error } = await db
      .from('conversations')
      .insert({
        org_id: ORG_ID,
        managed_agent_session_id: sessionId,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      conversation_id: conversation.id,
      session_id: sessionId,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
