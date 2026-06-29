import type { GleanMessage } from './types'

/**
 * Pull the final JSON object out of Glean's AI reply. Glean is agentic and
 * returns several GLEAN_AI messages (thinking, tool calls, final answer); the
 * answer is the LAST valid JSON we can find. Returns null if none parses.
 */
export function extractJson(messages: GleanMessage[]): unknown | null {
  const text = messages
    .filter((m) => m.author === 'GLEAN_AI')
    .flatMap((m) => m.fragments)
    .map((f) => f.text ?? '')
    .join('\n')

  const candidates: string[] = []
  // fenced ```json ... ``` blocks, in order
  for (const m of text.matchAll(/```json\s*([\s\S]*?)```/gi)) candidates.push(m[1])
  // fallback: the last bare {...} span
  if (candidates.length === 0) {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1))
  }

  // try last candidate first (the final answer)
  for (let i = candidates.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(candidates[i].trim())
    } catch {
      // try the next-earlier candidate
    }
  }
  return null
}
