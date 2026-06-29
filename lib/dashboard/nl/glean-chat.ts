import { GLEAN_BASE_URL, getGleanHeaders } from '@/lib/glean'
import type { GleanChatFn, GleanMessage } from './types'

/** Real Glean chat call. resolveBlockNL uses this by default; tests inject a fake. */
export const realGleanChat: GleanChatFn = async (messages, actAsEmail) => {
  const res = await fetch(`${GLEAN_BASE_URL}/chat`, {
    method: 'POST',
    headers: getGleanHeaders(actAsEmail),
    body: JSON.stringify({ messages, saveChat: false }),
  })
  if (!res.ok) {
    throw new Error(`Glean API error: ${res.status}`)
  }
  const data = (await res.json()) as { messages?: GleanMessage[] }
  return data.messages ?? []
}
