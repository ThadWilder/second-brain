// ─────────────────────────────────────────
// Database row types (matching schema exactly)
// ─────────────────────────────────────────

export type ProcessingStatus = 'pending' | 'processing' | 'done' | 'failed'
export type EntrySource = 'email' | 'chat' | 'paste' | 'meeting_notes'
export type TaskStatus = 'open' | 'done' | 'blocked'
export type EventType =
  | 'created'
  | 'status_change'
  | 'escalated'
  | 'de_escalated'
  | 'due_date_changed'
  | 'note_added'
  | 'nudged'

export interface Attachment {
  url: string
  type: string
  filename: string
}

export interface Entry {
  id: string
  org_id: string
  raw_text: string
  source: EntrySource
  source_meta: Record<string, unknown> | null
  source_dedupe_key: string
  processing_status: ProcessingStatus
  processing_error: string | null
  attempt_count: number
  attachments: Attachment[]
  links: string[]
  created_at: string
  processed_at: string | null
}

export interface Entity {
  id: string
  org_id: string
  type: string
  name: string
  normalized_name: string
  metadata: Record<string, unknown> | null
  first_seen: string
  last_seen: string
  created_at: string
}

export interface EntityAlias {
  id: string
  entity_id: string
  alias: string
  normalized_alias: string
  created_at: string
}

export interface EntryEntity {
  id: string
  entry_id: string
  entity_id: string
  relationship: 'about' | 'assigned_to' | 'waiting_on' | 'decided_by'
}

export interface Task {
  id: string
  org_id: string
  entry_id: string | null
  description: string
  status: TaskStatus
  escalation: boolean
  due_date: string | null
  waiting_on: string | null
  waiting_on_entity_id: string | null
  resolved_at: string | null
  updated_at: string
  created_at: string
}

export interface TaskEvent {
  id: string
  task_id: string
  entry_id: string | null
  event_type: EventType
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface TaskEntity {
  id: string
  task_id: string
  entity_id: string
  role: 'brand' | 'assigned_to' | 'vendor' | 'topic'
}

export interface Decision {
  id: string
  org_id: string
  entry_id: string | null
  summary: string
  made_by: string | null
  created_at: string
}

export interface DecisionEntity {
  id: string
  decision_id: string
  entity_id: string
  role: string
}

export interface PendingResponse {
  id: string
  org_id: string
  entry_id: string | null
  summary: string
  responded: boolean
  created_at: string
}

export interface NudgeMessage {
  id: string
  org_id: string
  channel: 'email' | 'in_app'
  postmark_message_id: string | null
  sent_at: string
  responded: boolean
  response_entry_id: string | null
}

export interface Conversation {
  id: string
  org_id: string
  managed_agent_session_id: string | null
  created_at: string
  last_active_at: string
}

export interface Message {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  tool_calls: unknown | null
  created_at: string
}

// ─────────────────────────────────────────
// Enriched view types (with joined data)
// ─────────────────────────────────────────

export interface TaskWithEntities extends Task {
  entities: Array<Entity & { role: string }>
  event_count?: number
  nudge_count?: number
}

export interface BrandSummary {
  entity: Entity
  open_tasks: number
  escalated_tasks: number
  last_activity: string | null
  health: 'green' | 'amber' | 'red'
}

export interface DashboardStats {
  escalations: number
  needs_response: number
  open_tasks: number
  closed_7d: number
  waiting_on: number
  dumplings_this_week: number
}

export interface HeatmapCell {
  brand_id: string
  brand_name: string
  date: string
  count: number
}

// ─────────────────────────────────────────
// Ingest / Claude tool types
// ─────────────────────────────────────────

export interface ClassifyEntityInput {
  name: string
  type: string
  metadata?: Record<string, unknown>
  matched_entity_id?: string  // if Claude matched to existing
}

export interface CreateTaskInput {
  description: string
  due_date?: string
  waiting_on?: string
  entity_names?: string[]
  brand_name?: string
}

export interface LogDecisionInput {
  summary: string
  made_by?: string
  entity_names?: string[]
}

export interface FlagPendingResponseInput {
  summary: string
  entity_names?: string[]
}

export interface SuggestConsolidationInput {
  new_task_description: string
  existing_task_id: string
  merged_description: string
  reason: string
}

export interface IngestResult {
  entry_id: string
  tasks_created: number
  decisions_created: number
  pending_responses_created: number
  entities_resolved: number
  entities_created: number
  consolidation_suggestions_created: number
}

// ─────────────────────────────────────────
// Chat / Managed Agents types
// ─────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  attachments?: Attachment[]
  created_at?: string
  isStreaming?: boolean
}

export type ChatEvent =
  | { type: 'message_start' }
  | { type: 'content_delta'; delta: string }
  | { type: 'message_stop' }
  | { type: 'tool_use'; tool_name: string; tool_input: unknown; tool_use_id: string }
  | { type: 'tool_result'; tool_use_id: string; result: unknown }
  | { type: 'error'; message: string }
