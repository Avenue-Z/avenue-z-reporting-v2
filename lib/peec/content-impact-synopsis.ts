// lib/peec/content-impact-synopsis.ts
import { cached } from '@/lib/cache'
import { gleanChat } from '@/lib/glean'

// Executive synopsis + recommended actions for the AEO Content Impact tab.
// Mirrors lib/peec/pr-influence-synopsis.ts: server-side Glean Chat call,
// strict-JSON output, three-tier extractor, cached per (clientSlug, dateRange,
// context) for one hour. Content-Impact-specific data inputs (8 §A KPI values
// + top owned domains + top competitor domains + top brand-absent competitor
// URLs) flow in via the context arg so the prompt always references real
// numbers from the page rather than fetching anything itself.
//
// FB-033. Layered with FB-025 (numeric formatting) and FB-031 (data-integrity
// guardrails) from day one. See docs/official-feedback/feedback-log.md.

export type ContentImpactSynopsis = {
  synopsis: string
  actions: string[]
}

export type ContentImpactSynopsisContext = {
  plannedUrlsInScope: number | null
  liveUrls: number | null
  totalSessions: number | null
  totalAiCitations: number
  aiReferredSessions: number | null
  ownedUrlsWithAiActivity: number | null
  unmatchedPct: number | null
  ownedDomainsCited: number
  topOwnedDomainsByCitations: Array<{ domain: string; citationCount: number }>
  topCompetitorDomainsByCitations: Array<{ domain: string; citationCount: number }>
  topBrandAbsentCompetitorUrls: Array<{ url: string; host: string; citationCount: number }>
  brandAbsentCompetitorUrlCount: number
}

/**
 * FB-033 . Post-Glean grounding validator (FB-031 pattern carried forward).
 *
 * Scans the synopsis prose for numeric claims about specific Content Impact
 * metrics and verifies each one matches the corresponding context value.
 * Catches the exact class of failure FB-031 fixed on PR Influence: Glean
 * producing prose that contradicts the source-of-truth context the rest of
 * the page renders.
 *
 * Intentionally narrow: false positives waste retries; false negatives let
 * one bug slip through. We catch the three patterns most likely to slip past
 * the prompt-level rule. Other metrics carry less semantic ambiguity and
 * stay un-validated for now.
 */
export function validateContentImpactSynopsisGrounding(
  synopsis: string,
  context: ContentImpactSynopsisContext,
): { ok: boolean; violations: string[] } {
  const violations: string[] = []

  // Rule 1, brand-absent competitor URL count (the FB-031-analog risk).
  const brandAbsentRe = /\b(\d+|no|zero)\s+(?:competitor|third[- ]party)?\s*(?:URLs?|pages?)\s+where\s+(?:the\s+)?brand\s+(?:is|was)\s+absent/i
  const m = synopsis.match(brandAbsentRe)
  if (m) {
    const claimedRaw = m[1].toLowerCase()
    const claimedNum = claimedRaw === 'no' || claimedRaw === 'zero' ? 0 : parseInt(claimedRaw, 10)
    if (claimedNum !== context.brandAbsentCompetitorUrlCount) {
      violations.push(
        `brandAbsentCompetitorUrlCount mismatch: prose claims "${m[0]}" but context.brandAbsentCompetitorUrlCount = ${context.brandAbsentCompetitorUrlCount}`,
      )
    }
  }

  // Rules 2 + 3 land in Task 2.
  return { ok: violations.length === 0, violations }
}

// Cache + Glean call land in Task 3. Stub the export so the test file can
// import the module without a compile error.
export const getContentImpactSynopsis = async (
  _clientSlug: string | undefined,
  _dateRange: string,
  _context: ContentImpactSynopsisContext,
): Promise<ContentImpactSynopsis> => {
  // Replaced in Task 3 with the cached() wrapper.
  void cached
  void gleanChat
  throw new Error('getContentImpactSynopsis not yet implemented')
}
