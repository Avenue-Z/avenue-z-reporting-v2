// The "who is this link for" label an approval records (spec §9). Cleaned like every other value.
import { cleanValue } from './slots'

export const MAX_RECIPIENT = 200
export const RECIPIENT_ERROR = 'Say who this link is for (1 to 200 characters).'

export function cleanRecipient(v: unknown): { ok: true; value: string } | { ok: false; error: typeof RECIPIENT_ERROR } {
  if (typeof v !== 'string') return { ok: false, error: RECIPIENT_ERROR }
  const value = cleanValue(v)
  return value.length >= 1 && value.length <= MAX_RECIPIENT ? { ok: true, value } : { ok: false, error: RECIPIENT_ERROR }
}
