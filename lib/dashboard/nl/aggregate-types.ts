import type { BlockConfig } from '@/lib/dashboard/types'
import type { Candidate } from './types'

type OperandAlternatives = { metric?: Candidate[]; account?: Candidate[] }

export interface AggregateProposal {
  config: BlockConfig // binding is an AggregateBinding; validated; id '__pending__'
  confidence: number  // 0..1 for the overall formula
  alternatives: { left?: OperandAlternatives; right?: OperandAlternatives }
}

export type AggregateResolutionResult =
  | { kind: 'proposal'; proposal: AggregateProposal }
  | { kind: 'clarify'; question: string }
  | { kind: 'error'; error: string }

export interface AggregateResolveInput { formula: string; actAsEmail: string }
