// This tool's own Glean chat call (spec §6). Same request body as gleanChat (lib/glean.ts:54-65) but it keeps
// the raw messages so the search guard can see whether Glean searched company documents. lib/glean.ts is
// imported, not changed.
//
// Act-as follows the token (measured 2026-10-14). An organization-wide token refuses a call without X-Scio-Actas
// ("Required header missing: X-Glean-ActAs", probed with the local token); a user token refuses a call with it (400,
// on staging, whose token the Peec synopses use without act-as, lib/glean.ts gleanChat). So the tool sends the
// signed-in user's email as X-Scio-Actas only when GLEAN_ACT_AS is exactly "true" (set it where GLEAN_API_TOKEN is
// organization-wide); otherwise it calls Glean as the synopses do, as the token's owner. The email must come from the
// server session, never from the request.
import { GLEAN_BASE_URL, getGleanHeaders } from '@/lib/glean'

export interface GleanReply { text: string; searched: boolean }
type Frag = Record<string, unknown>
type Msg = { author?: string; messageType?: string; fragments?: unknown; citations?: unknown }
const SEARCH_KEYS = ['querySuggestion', 'structuredResults', 'action', 'citation'] as const

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const fragmentsOf = (m: Msg): Frag[] => (Array.isArray(m.fragments) ? m.fragments.filter(isObj) : [])

// Parses an untrusted payload: anything malformed is treated as absent.
export function readGleanReply(payload: unknown): GleanReply {
  const raw = isObj(payload) ? payload.messages : undefined
  const msgs: Msg[] = Array.isArray(raw) ? raw.filter(isObj) : []
  const searched = msgs.some(
    (m) => (Array.isArray(m.citations) && m.citations.length > 0) || fragmentsOf(m).some((f) => SEARCH_KEYS.some((k) => f[k] != null)),
  )
  const content = msgs.filter((m) => m.author === 'GLEAN_AI' && m.messageType === 'CONTENT')
  const texts = content.map((m) => fragmentsOf(m).map((f) => (typeof f.text === 'string' ? f.text : '')).join('').trim())
  const text = texts.filter(Boolean).pop() ?? ''
  if (!text) throw new Error('Glean chat returned no answer')
  return { text, searched }
}

export async function gleanOnce(prompt: string, signal: AbortSignal, actAsEmail: string, fetchImpl: typeof globalThis.fetch = globalThis.fetch): Promise<GleanReply> {
  if (!process.env.GLEAN_API_TOKEN || !process.env.GLEAN_INSTANCE) throw new Error('Glean is not configured')
  const actAs = process.env.GLEAN_ACT_AS === 'true'
  if (actAs && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(actAsEmail)) throw new Error('Glean needs the signed-in user\'s email')
  const res = await fetchImpl(`${GLEAN_BASE_URL}/chat`, {
    method: 'POST',
    headers: getGleanHeaders(actAs ? actAsEmail : undefined),
    body: JSON.stringify({ messages: [{ author: 'USER', fragments: [{ text: prompt }] }], saveChat: false }),
    signal,
  })
  if (!res.ok) {
    if (res.status >= 400 && res.status < 500) {
      // A refusal says why (a missing or rejected act-as header, say): log Glean's reason, short, with the token removed
      // and no prompt text sent back; the thrown message stays the status only.
      const why = await res.text().catch(() => '')
      const token = process.env.GLEAN_API_TOKEN ?? ''
      const detail = (token ? why.split(token).join('[redacted]') : why).replace(/\s+/g, ' ').trim().slice(0, 160)
      console.warn(`[aeo-outbound] glean refused status=${res.status} actAs=${actAs} detail=${detail}`)
    } else {
      await res.body?.cancel().catch(() => {})
    }
    throw new Error(`Glean chat error ${res.status}`)
  }
  let payload: unknown
  try {
    payload = await res.json()
  } catch (e) {
    if (signal.aborted) throw e
    throw new Error('Glean chat returned unreadable JSON')
  }
  return readGleanReply(payload)
}
