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

export function getLast7DaysRange(): { from: string; to: string } {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 7)
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  }
}

// Glean Chat: send a single-shot prompt to Glean's chat endpoint and return
// the concatenated AI text. Mirrors the inline fetch in
// app/api/glean/meeting-brief/route.ts. Server-side only. Throws on terminal
// failure so callers can decide between retry, fallback UI, or surfacing the
// error.
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

  const actAs = options.actAs ?? process.env.GLEAN_ACT_AS ?? 'thomas.chang@avenuez.com'

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

export function buildMeetingPrepPrompt(
  clientName: string,
  dateRange: { from: string; to: string }
): string {
  return `You are preparing a concise client meeting brief for Avenue Z, a marketing agency.

Search for recent activity related to "${clientName}" from ${dateRange.from} to ${dateRange.to}.

Write a SHORT, scannable brief. Use this exact format with these exact markdown headings. Keep each section to 2-4 bullet points max. No long paragraphs.

# Meeting Prep: ${clientName}

## What Happened This Week
The 3-4 most important things that happened — campaigns launched, deliverables completed, decisions made, issues raised. One sentence per bullet.

## Action Items
2-4 specific things the Avenue Z team needs to address or bring up in the meeting. Be concrete.

## Risks & Blockers
Any unresolved issues, missed deadlines, or concerns. If none, say "No blockers identified."

## Talking Points for the Meeting
3-4 suggested talking points or questions to bring to the client. Frame as conversation starters.

Rules:
- Keep the entire brief under 400 words
- Use bullet points, not paragraphs
- Be specific — include names, dates, campaign names when available
- If you find limited information, say so briefly and move on
- Do not include section headers if you have nothing for that section`
}
