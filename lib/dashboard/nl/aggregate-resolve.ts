// lib/dashboard/nl/aggregate-resolve.ts
import { resolveWithRepair } from './run'
import { buildAggregatePrompt } from './aggregate-prompt'
import { parseAggregateProposal } from './aggregate-parse'
import { realGleanChat } from './glean-chat'
import type { GleanChatFn } from './types'
import type { AggregateProposal, AggregateResolutionResult, AggregateResolveInput } from './aggregate-types'

/**
 * Resolve a free-form cross-source formula into a validated aggregate BlockConfig
 * proposal (two leaf operands + binary op) or a clarifying question. Never throws.
 */
export async function resolveAggregateNL(
  input: AggregateResolveInput,
  deps: { chat?: GleanChatFn } = {},
): Promise<AggregateResolutionResult> {
  const chat = deps.chat ?? realGleanChat
  return resolveWithRepair<AggregateProposal>(
    { buildPrompt: () => buildAggregatePrompt(input.formula), parse: parseAggregateProposal },
    chat,
    input.actAsEmail,
  )
}
