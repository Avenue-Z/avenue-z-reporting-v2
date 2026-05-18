import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import {
  GLEAN_BASE_URL,
  getGleanHeaders,
  getLast7DaysRange,
  buildMeetingPrepPrompt,
} from '@/lib/glean'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  // Auth guard — internal only (demo cookie)
  const cookieStore = await cookies()
  const raw = cookieStore.get('demo-session')?.value
  if (!raw) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    const session = JSON.parse(raw)
    if (session.role !== 'internal') {
      return new Response('Unauthorized — internal only', { status: 403 })
    }
  } catch {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = await request.json()
  const { clientName, clientSlug } = body

  if (!clientName || !clientSlug) {
    return new Response('clientName and clientSlug are required', { status: 400 })
  }

  if (!process.env.GLEAN_API_TOKEN || !process.env.GLEAN_INSTANCE) {
    return Response.json(
      { error: 'Glean not configured — add GLEAN_API_TOKEN and GLEAN_INSTANCE to .env.local' },
      { status: 500 }
    )
  }

  const dateRange = getLast7DaysRange()
  const prompt = buildMeetingPrepPrompt(clientName, dateRange)

  try {
    const gleanResponse = await fetch(`${GLEAN_BASE_URL}/chat`, {
      method: 'POST',
      headers: getGleanHeaders('bill.hoerr@avenuez.com'),
      body: JSON.stringify({
        messages: [
          {
            author: 'USER',
            fragments: [{ text: prompt }],
          },
        ],
        saveChat: false,
      }),
    })

    if (!gleanResponse.ok) {
      const error = await gleanResponse.text()
      console.error('[Glean API Error]', gleanResponse.status, error)
      return Response.json(
        { error: `Glean API error: ${gleanResponse.status}` },
        { status: gleanResponse.status }
      )
    }

    const data = (await gleanResponse.json()) as {
      messages: Array<{
        author: string
        fragments: Array<{
          text?: string
          citation?: { sourceDocument?: { title?: string; url?: string } }
        }>
      }>
    }

    console.log('[Glean] Raw response messages:', JSON.stringify(data.messages?.map(m => ({ author: m.author, textLength: m.fragments.reduce((s, f) => s + (f.text?.length ?? 0), 0) }))))

    // Collect all AI message fragments
    const aiMessages = data.messages?.filter((m) => m.author === 'GLEAN_AI') ?? []
    if (aiMessages.length === 0) {
      return Response.json({ error: 'No response from Glean' }, { status: 502 })
    }

    // Take only the longest AI message — that's the actual brief.
    // All shorter messages are thinking, tool calls, or intermediate steps.
    const sorted = [...aiMessages].sort((a, b) => {
      const aLen = a.fragments.reduce((s, f) => s + (f.text?.length ?? 0), 0)
      const bLen = b.fragments.reduce((s, f) => s + (f.text?.length ?? 0), 0)
      return bLen - aLen
    })
    const bestMessage = sorted[0]

    let brief = ''
    const sources: Array<{ title: string; url: string }> = []

    for (const fragment of bestMessage.fragments) {
      if (fragment.text) {
        brief += fragment.text
      }
      if (fragment.citation?.sourceDocument) {
        const src = fragment.citation.sourceDocument
        if (src.title && src.url) {
          sources.push({ title: src.title, url: src.url })
        }
      }
    }

    // If we filtered out everything, return a helpful message
    if (!brief.trim()) {
      brief = `# Meeting Prep: ${clientName}\n\nGlean searched for recent activity but the response was not in the expected format.\n\n**Try again** — the next attempt typically returns the full brief.`
    }

    // Deduplicate sources
    const uniqueSources = sources.filter((s, i, arr) => arr.findIndex((x) => x.url === s.url) === i)
    if (uniqueSources.length > 0) {
      brief += '\n\n---\n\n## Sources\n'
      uniqueSources.slice(0, 10).forEach((s, i) => {
        brief += `${i + 1}. [${s.title}](${s.url})\n`
      })
    }

    return Response.json({
      brief,
      generatedAt: new Date().toISOString(),
      clientName,
      dateRange,
    })
  } catch (err) {
    console.error('[Glean Error]', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
