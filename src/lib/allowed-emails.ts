export const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS ?? '')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean)

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return ALLOWED_EMAILS.includes(email.toLowerCase())
}
