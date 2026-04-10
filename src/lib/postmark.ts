import * as postmark from 'postmark'
import crypto from 'crypto'

let _postmarkClient: postmark.ServerClient | null = null

function getPostmarkClient(): postmark.ServerClient {
  if (!_postmarkClient) {
    _postmarkClient = new postmark.ServerClient(process.env.POSTMARK_SERVER_TOKEN!)
  }
  return _postmarkClient
}

export const postmarkClient = new Proxy({} as postmark.ServerClient, {
  get(_target, prop) {
    return (getPostmarkClient() as unknown as Record<string, unknown>)[prop as string]
  },
})

export const FROM_EMAIL = process.env.POSTMARK_FROM_EMAIL ?? ''
export const TO_EMAIL = process.env.POSTMARK_TO_EMAIL ?? ''

// ─────────────────────────────────────────
// Webhook signature verification
// Postmark sends X-Postmark-Signature header
// ─────────────────────────────────────────
export function verifyPostmarkWebhook(
  body: string,
  signature: string | null
): boolean {
  const secret = process.env.POSTMARK_WEBHOOK_SECRET
  if (!secret || secret === 'your-postmark-webhook-secret') return true // skip if not configured
  if (!signature) return false

  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('base64')

  const sigBuf = Buffer.from(signature)
  const expBuf = Buffer.from(expected)

  if (sigBuf.length !== expBuf.length) return false

  return crypto.timingSafeEqual(sigBuf, expBuf)
}

// ─────────────────────────────────────────
// Send a nudge email, return Postmark MessageID
// ─────────────────────────────────────────
export async function sendNudgeEmail(params: {
  subject: string
  htmlBody: string
  textBody: string
  replyToMessageId?: string  // for threading
}): Promise<string> {
  const headers: postmark.Header[] = []

  if (params.replyToMessageId) {
    headers.push({
      Name: 'In-Reply-To',
      Value: `<${params.replyToMessageId}>`,
    })
    headers.push({
      Name: 'References',
      Value: `<${params.replyToMessageId}>`,
    })
  }

  const response = await postmarkClient.sendEmail({
    From: FROM_EMAIL,
    To: TO_EMAIL,
    Subject: params.subject,
    HtmlBody: params.htmlBody,
    TextBody: params.textBody,
    Headers: headers,
    MessageStream: 'outbound',
  })

  return response.MessageID
}

// ─────────────────────────────────────────
// Send a briefing / digest email
// ─────────────────────────────────────────
export async function sendBriefingEmail(params: {
  subject: string
  htmlBody: string
  textBody: string
}): Promise<void> {
  await postmarkClient.sendEmail({
    From: FROM_EMAIL,
    To: TO_EMAIL,
    Subject: params.subject,
    HtmlBody: params.htmlBody,
    TextBody: params.textBody,
    MessageStream: 'outbound',
  })
}

// ─────────────────────────────────────────
// Parse Postmark inbound webhook payload
// ─────────────────────────────────────────
export interface PostmarkInbound {
  MessageID: string
  From: string
  Subject: string
  TextBody: string
  HtmlBody: string
  InReplyTo?: string
  StrippedTextReply?: string
}

export function parsePostmarkInbound(body: unknown): PostmarkInbound {
  const payload = body as Record<string, unknown>
  return {
    MessageID: payload.MessageID as string,
    From: payload.From as string,
    Subject: payload.Subject as string,
    TextBody: (payload.TextBody as string) ?? '',
    HtmlBody: (payload.HtmlBody as string) ?? '',
    InReplyTo: payload.InReplyTo as string | undefined,
    StrippedTextReply: payload.StrippedTextReply as string | undefined,
  }
}
