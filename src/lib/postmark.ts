import * as postmark from 'postmark'

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

  try {
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
  } catch (err) {
    console.error('[postmark] Failed to send nudge email:', err)
    throw err
  }
}

// ─────────────────────────────────────────
// Send a briefing / digest email
// ─────────────────────────────────────────
export async function sendBriefingEmail(params: {
  subject: string
  htmlBody: string
  textBody: string
}): Promise<void> {
  try {
    await postmarkClient.sendEmail({
      From: FROM_EMAIL,
      To: TO_EMAIL,
      Subject: params.subject,
      HtmlBody: params.htmlBody,
      TextBody: params.textBody,
      MessageStream: 'outbound',
    })
  } catch (err) {
    console.error('[postmark] Failed to send briefing email:', err)
    throw err
  }
}

// ─────────────────────────────────────────
// Parse Postmark inbound webhook payload
// ─────────────────────────────────────────
export interface PostmarkAttachment {
  Name: string
  Content: string // base64 encoded
  ContentType: string
  ContentLength: number
}

export interface PostmarkInbound {
  MessageID: string
  From: string
  Subject: string
  TextBody: string
  HtmlBody: string
  InReplyTo?: string
  StrippedTextReply?: string
  Attachments: PostmarkAttachment[]
}

export function parsePostmarkInbound(body: unknown): PostmarkInbound {
  const payload = body as Record<string, unknown>
  const rawAttachments = (payload.Attachments as PostmarkAttachment[]) ?? []
  return {
    MessageID: payload.MessageID as string,
    From: payload.From as string,
    Subject: payload.Subject as string,
    TextBody: (payload.TextBody as string) ?? '',
    HtmlBody: (payload.HtmlBody as string) ?? '',
    InReplyTo: payload.InReplyTo as string | undefined,
    StrippedTextReply: payload.StrippedTextReply as string | undefined,
    Attachments: rawAttachments,
  }
}
