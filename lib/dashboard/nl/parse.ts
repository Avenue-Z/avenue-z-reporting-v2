import { parseBlockConfig } from '@/lib/dashboard/persistence'
import { MIN_CONFIDENCE, type Candidate, type ResolutionResult } from './types'

const PROPOSAL_PLACEHOLDER_ID = '__pending__'

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function parseCandidates(v: unknown): Candidate[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: Candidate[] = []
  for (const c of v) {
    if (isObj(c) && typeof c.value === 'string' && typeof c.label === 'string') {
      const cand: Candidate = { value: c.value, label: c.label }
      if (typeof c.confidence === 'number') cand.confidence = c.confidence
      out.push(cand)
    }
  }
  return out.slice(0, 5) // cap at 5, preserving given (best-first) order
}

export function parseProposal(json: unknown): ResolutionResult {
  if (!isObj(json)) return { kind: 'error', error: 'proposal: expected object' }

  // explicit intent-ambiguity clarify wins
  if (typeof json.clarify === 'string' && json.clarify.trim().length > 0) {
    return { kind: 'clarify', question: json.clarify.trim() }
  }

  if (!isObj(json.config)) return { kind: 'error', error: 'proposal.config: expected object' }

  // assign a placeholder id so the config satisfies parseBlockConfig (real id assigned at save)
  const candidate = { ...json.config, id: PROPOSAL_PLACEHOLDER_ID }
  const pb = parseBlockConfig(candidate, 'proposal.config')
  if (!pb.ok) return { kind: 'error', error: pb.error }
  if (pb.block.binding.source === 'aggregate') {
    return { kind: 'error', error: 'proposal.config.binding: aggregate not supported by the NL resolver (#5)' }
  }

  const confidence = typeof json.confidence === 'number' ? json.confidence : 0
  if (confidence < MIN_CONFIDENCE) {
    return { kind: 'clarify', question: 'I could not confidently identify the metric. Which metric did you mean?' }
  }

  const altsRaw = isObj(json.alternatives) ? json.alternatives : {}
  const alternatives: { metric?: Candidate[]; account?: Candidate[] } = {}
  const metric = parseCandidates(altsRaw.metric)
  const account = parseCandidates(altsRaw.account)
  if (metric && metric.length) alternatives.metric = metric
  if (account && account.length) alternatives.account = account

  return { kind: 'proposal', proposal: { config: pb.block, confidence, alternatives } }
}
