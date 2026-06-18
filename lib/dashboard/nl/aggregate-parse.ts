import { parseBlockConfig } from '@/lib/dashboard/persistence'
import { MIN_CONFIDENCE, type Candidate } from './types'
import { isObj, parseCandidates, PROPOSAL_PLACEHOLDER_ID } from './parse'
import type { AggregateProposal, AggregateResolutionResult, OperandAlternatives } from './aggregate-types'

function parseOperandAlternatives(v: unknown): OperandAlternatives | undefined {
  if (!isObj(v)) return undefined
  const out: OperandAlternatives = {}
  const metric = parseCandidates(v.metric)
  const account = parseCandidates(v.account)
  if (metric && metric.length) out.metric = metric
  if (account && account.length) out.account = account
  return Object.keys(out).length > 0 ? out : undefined
}

export function parseAggregateProposal(json: unknown): AggregateResolutionResult {
  if (!isObj(json)) return { kind: 'error', error: 'proposal: expected object' }

  // explicit intent-ambiguity clarify wins
  if (typeof json.clarify === 'string' && json.clarify.trim().length > 0) {
    return { kind: 'clarify', question: json.clarify.trim() }
  }

  if (!isObj(json.config)) return { kind: 'error', error: 'proposal.config: expected object' }

  const candidate = { ...json.config, id: PROPOSAL_PLACEHOLDER_ID }
  const pb = parseBlockConfig(candidate, 'proposal.config')
  if (!pb.ok) return { kind: 'error', error: pb.error }
  if (pb.block.binding.source !== 'aggregate') {
    return { kind: 'error', error: 'proposal.config.binding: expected an aggregate formula with two operands' }
  }

  const confidence = typeof json.confidence === 'number' ? json.confidence : 0
  if (confidence < MIN_CONFIDENCE) {
    return { kind: 'clarify', question: 'I could not confidently resolve the formula. Can you restate it (e.g. "X divided by Y")?' }
  }

  const altsRaw = isObj(json.alternatives) ? json.alternatives : {}
  const alternatives: AggregateProposal['alternatives'] = {}
  const left = parseOperandAlternatives(altsRaw.left)
  const right = parseOperandAlternatives(altsRaw.right)
  if (left) alternatives.left = left
  if (right) alternatives.right = right

  return { kind: 'proposal', proposal: { config: pb.block, confidence, alternatives } }
}
