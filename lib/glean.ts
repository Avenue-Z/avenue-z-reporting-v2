// Glean Client API utility — server-side only, never import in client components

const GLEAN_INSTANCE = process.env.GLEAN_INSTANCE ?? ''
const GLEAN_API_TOKEN = process.env.GLEAN_API_TOKEN ?? ''

export const GLEAN_BASE_URL = `https://${GLEAN_INSTANCE}-be.glean.com/rest/api/v1`

export function getGleanHeaders(actAsEmail?: string): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${GLEAN_API_TOKEN}`,
    'Content-Type': 'application/json',
  }
  // Global tokens require X-Scio-Actas to specify the user context
  if (actAsEmail) {
    headers['X-Scio-Actas'] = actAsEmail
  }
  return headers
}

// Glean Chat: send a single-shot prompt to Glean's chat endpoint and return
// the concatenated AI text. Server-side only. Throws on terminal failure so
// callers can decide between retry, fallback UI, or surfacing the error.
//
// Glean returns multiple `messages` with mixed authors (USER, GLEAN_AI). We
// keep only GLEAN_AI messages and take the one with the longest text body —
// shorter ones are thinking / tool / intermediate steps in the agent loop.
export async function gleanChat(
  prompt: string,
  options: { actAs?: string; saveChat?: boolean; signal?: AbortSignal } = {},
): Promise<string> {
  if (!process.env.GLEAN_API_TOKEN || !process.env.GLEAN_INSTANCE) {
    throw new Error('Glean is not configured. Set GLEAN_API_TOKEN and GLEAN_INSTANCE in the environment.')
  }

  // X-Scio-Actas is only accepted by Glean GLOBAL tokens. User tokens (the
  // common case) reject it with HTTP 400. Make impersonation explicit: callers
  // that have a global token + need to act-as a specific user pass actAs in
  // options. Default callers skip the header and the call runs as the token
  // owner — which is what we want for our internal reporting synopses.
  const actAs = options.actAs

  const res = await fetch(`${GLEAN_BASE_URL}/chat`, {
    method: 'POST',
    headers: getGleanHeaders(actAs),
    body: JSON.stringify({
      messages: [
        {
          author: 'USER',
          fragments: [{ text: prompt }],
        },
      ],
      saveChat: options.saveChat ?? false,
    }),
    signal: options.signal,
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`Glean chat error ${res.status}: ${errBody.slice(0, 500)}`)
  }

  const data = (await res.json()) as {
    messages?: Array<{
      author: string
      fragments: Array<{ text?: string }>
    }>
  }

  const aiMessages = data.messages?.filter((m) => m.author === 'GLEAN_AI') ?? []
  if (aiMessages.length === 0) {
    throw new Error('Glean chat returned no AI messages')
  }

  // Take the longest AI message — that is the actual completion. Shorter
  // messages are intermediate thinking / tool calls in Glean's agent loop.
  const sorted = [...aiMessages].sort((a, b) => {
    const aLen = a.fragments.reduce((s, f) => s + (f.text?.length ?? 0), 0)
    const bLen = b.fragments.reduce((s, f) => s + (f.text?.length ?? 0), 0)
    return bLen - aLen
  })
  const best = sorted[0]
  const text = best.fragments.map((f) => f.text ?? '').join('').trim()

  if (!text) {
    throw new Error('Glean chat returned an empty AI message')
  }
  return text
}
