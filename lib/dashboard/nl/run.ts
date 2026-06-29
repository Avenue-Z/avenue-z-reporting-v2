import { extractJson } from './extract'
import type { GleanChatFn, GleanMessage } from './types'

/** The shared discriminated result shape, generic over the proposal payload. */
export type RunResult<P> =
  | { kind: 'proposal'; proposal: P }
  | { kind: 'clarify'; question: string }
  | { kind: 'error'; error: string }

const userMsg = (text: string): GleanMessage => ({ author: 'USER', fragments: [{ text }] })

/**
 * Generic Glean resolution loop shared by the leaf (#4) and aggregate (#5)
 * resolvers: build prompt → chat → extractJson → parse; on an error result, one
 * repair retry; never throws (Glean/transport failures become an error result).
 */
export async function resolveWithRepair<P>(
  opts: { buildPrompt: () => string; parse: (json: unknown) => RunResult<P> },
  chat: GleanChatFn,
  actAsEmail: string,
): Promise<RunResult<P>> {
  const basePrompt = opts.buildPrompt()
  const fromReply = (reply: GleanMessage[]): RunResult<P> => {
    const json = extractJson(reply)
    if (json === null) return { kind: 'error', error: 'no JSON found in Glean reply' }
    return opts.parse(json)
  }
  try {
    let result = fromReply(await chat([userMsg(basePrompt)], actAsEmail))
    if (result.kind === 'error') {
      const repair = userMsg(
        `Your previous reply was not valid JSON matching the schema (${result.error}). Return ONLY the single fenced JSON object, no prose.`,
      )
      result = fromReply(await chat([userMsg(basePrompt), repair], actAsEmail))
    }
    return result
  } catch (e) {
    return { kind: 'error', error: e instanceof Error ? e.message : 'Glean call failed' }
  }
}
