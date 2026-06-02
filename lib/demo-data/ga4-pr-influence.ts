/**
 * Sample GA4 referral rows for the PR Influence subsection. Used when
 * the page is in demoMode so the "AI Referral Sessions" KPI in Section A
 * has realistic numbers — without this, the real avenue-z GA4 query
 * usually shows --/0 because organic AI-referral traffic is still new
 * and small for most clients.
 *
 * The sessionSource values are matched against AI_REFERRER_DOMAINS in
 * the page; any source containing chatgpt/claude/perplexity/etc. is
 * counted toward the KPI.
 */
import type { GA4Row } from '@/lib/ga4/types'

export const SAMPLE_GA4_AI_REFERRAL_ROWS: GA4Row[] = [
  { sessionSource: 'chatgpt.com',    sessions:  847 },
  { sessionSource: 'perplexity.ai',  sessions:  392 },
  { sessionSource: 'claude.ai',      sessions:  218 },
  { sessionSource: 'gemini.google.com', sessions:  164 },
  { sessionSource: 'bing.com/copilot', sessions:  103 },
  { sessionSource: 'duckduckgo.com', sessions:   58 }, // non-AI; filtered out
  { sessionSource: 'google',          sessions: 3247 }, // non-AI; filtered out
]

export const SAMPLE_GA4_AI_REFERRAL_COMPARE_ROWS: GA4Row[] = [
  { sessionSource: 'chatgpt.com',    sessions:  612 },
  { sessionSource: 'perplexity.ai',  sessions:  271 },
  { sessionSource: 'claude.ai',      sessions:  148 },
  { sessionSource: 'gemini.google.com', sessions:  103 },
  { sessionSource: 'bing.com/copilot', sessions:   72 },
]
