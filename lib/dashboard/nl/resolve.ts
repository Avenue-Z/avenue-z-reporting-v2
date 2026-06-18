// lib/dashboard/nl/resolve.ts
import { buildResolutionPrompt } from './prompt'
import { extractJson } from './extract'
import { parseProposal } from './parse'
import { realGleanChat } from './glean-chat'
import type { GleanChatFn, GleanMessage, ResolutionResult, ResolveInput } from './types'

const userMsg = (text: string): GleanMessage => ({ author: 'USER', fragments: [{ text }] })

function resolveFromReply(reply: GleanMessage[]): ResolutionResult {
  const json = extractJson(reply)
  if (json === null) return { kind: 'error', error: 'no JSON found in Glean reply' }
  return parseProposal(json)
}

/**
 * Resolve a natural-language request into a validated leaf BlockConfig proposal
 * (or a clarifying question). Never throws — Glean/transport failures return
 * { kind: 'error' }. One repair retry on an unusable reply.
 */
export async function resolveBlockNL(
  input: ResolveInput,
  deps: { chat?: GleanChatFn } = {},
): Promise<ResolutionResult> {
  const chat = deps.chat ?? realGleanChat
  const basePrompt = buildResolutionPrompt(input.source, input.prompt)
  try {
    let result = resolveFromReply(await chat([userMsg(basePrompt)], input.actAsEmail))
    if (result.kind === 'error') {
      const repair = userMsg(
        `Your previous reply was not valid JSON matching the schema (${result.error}). Return ONLY the single fenced JSON object, no prose.`,
      )
      result = resolveFromReply(await chat([userMsg(basePrompt), repair], input.actAsEmail))
    }
    return result
  } catch (e) {
    return { kind: 'error', error: e instanceof Error ? e.message : 'Glean call failed' }
  }
}
