import type { BlockConfig } from '@/lib/dashboard/types'

/** Leaf sources only — aggregate NL is sub-project #5. */
export type SourceKind = 'supermetrics' | 'triplewhale'

/** Core-metric confidence below this routes to a clarifying question. */
export const MIN_CONFIDENCE = 0.5

export interface Candidate { value: string; label: string; confidence?: number }

export interface BlockProposal {
  config: BlockConfig // best-guess, already validated by parseBlockConfig (leaf binding only)
  confidence: number  // 0..1 for the core metric
  alternatives: { metric?: Candidate[]; account?: Candidate[] } // ranked best-first, capped at 5
}

export type ResolutionResult =
  | { kind: 'proposal'; proposal: BlockProposal }
  | { kind: 'clarify'; question: string }
  | { kind: 'error'; error: string }

/** One Glean chat message (mirrors the shape used in app/api/glean/meeting-brief/route.ts). */
export interface GleanMessage {
  author: string
  fragments: Array<{ text?: string; citation?: { sourceDocument?: { title?: string; url?: string } } }>
}

/** Injectable Glean transport — real impl in glean-chat.ts; tests pass a fake. */
export type GleanChatFn = (messages: GleanMessage[], actAsEmail: string) => Promise<GleanMessage[]>

export interface ResolveInput { source: SourceKind; prompt: string; actAsEmail: string }
