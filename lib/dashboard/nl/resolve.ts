// lib/dashboard/nl/resolve.ts
import { buildResolutionPrompt } from './prompt'
import { parseProposal } from './parse'
import { realGleanChat } from './glean-chat'
import { resolveWithRepair } from './run'
import type { BlockProposal, GleanChatFn, ResolutionResult, ResolveInput } from './types'

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
  return resolveWithRepair<BlockProposal>(
    { buildPrompt: () => buildResolutionPrompt(input.source, input.prompt), parse: parseProposal },
    chat,
    input.actAsEmail,
  )
}
