import { cached } from '@/lib/cache'
import { gleanChat } from '@/lib/glean'

// Executive synopsis + recommended actions for the AEO PR Influence tab.
// Mirrors lib/peec/synopsis.ts (the Overview synopsis): single-shot Glean
// Chat call, strict-JSON output, three-tier extractor, cached per
// (clientSlug, dateRange) for one hour. PR-Influence-specific data inputs
// (placement matchback, brand-absent editorial domains, opportunity
// clusters) flow in via the context arg so the prompt always references
// real numbers from the page rather than fetching anything itself.
//
// FB-009-a. See docs/official-feedback/feedback-log.md.
//
// FB-025 (numeric formatting) and FB-031 (data-integrity guardrails) layered
// on top so Glean can never silently produce prose that contradicts the
// source-of-truth context that the rest of the page renders.

export type PRInfluenceSynopsis = {
  synopsis: string
  actions: string[]
}

export type PRInfluenceSynopsisContext = {
  aiVisibility: number | null
  aiVisibilityDelta: number | null
  avgAiPosition: number | null
  avgAiPositionDelta: number | null
  totalAiCitations: number
  totalPlacements: number
  placementsCitedByAI: number
  aiReferralSessions: number | null
  aiReferralSessionsDelta: number | null
  totalEditorialDomains: number
  brandAbsentCount: number
  topBrandAbsentDomains: Array<{ domain: string; citationCount: number }>
  topOpportunityClusters: Array<{ cluster: string; score: number }>
}

function buildContext(args: { context: PRInfluenceSynopsisContext; dateRange: string }): string {
  const { context: c, dateRange } = args
  const visStr = c.aiVisibility != null ? `${c.aiVisibility.toFixed(1)}%` : 'n/a'
  const visDeltaStr = c.aiVisibilityDelta != null
    ? `${c.aiVisibilityDelta >= 0 ? '+' : ''}${c.aiVisibilityDelta.toFixed(1)}pp`
    : 'n/a'
  const posStr = c.avgAiPosition != null ? `#${c.avgAiPosition.toFixed(1)}` : 'n/a'
  const posDeltaStr = c.avgAiPositionDelta != null
    ? `${c.avgAiPositionDelta >= 0 ? '+' : ''}${c.avgAiPositionDelta.toFixed(1)}`
    : 'n/a'
  const aiRefStr = c.aiReferralSessions != null ? c.aiReferralSessions.toLocaleString() : 'not configured'
  const aiRefDeltaStr = c.aiReferralSessionsDelta != null
    ? `${c.aiReferralSessionsDelta >= 0 ? '+' : ''}${c.aiReferralSessionsDelta.toFixed(1)}%`
    : 'n/a'
  const citationRate = c.totalPlacements > 0
    ? `${((c.placementsCitedByAI / c.totalPlacements) * 100).toFixed(1)}%`
    : 'n/a'

  // FB-025: round per-domain citation counts to 1 decimal before interpolation.
  const brandAbsentBlock = c.topBrandAbsentDomains.length > 0
    ? `Top editorial hosts with brand-absent AI-cited URLs (highest AI citation count):
${c.topBrandAbsentDomains.map((d, i) => `${i + 1}. ${d.domain} - ${d.citationCount.toFixed(1)} AI citations`).join('\n')}`
    : 'Top editorial hosts with brand-absent URLs: none reported in period.'

  // FB-025: opportunity score is a derived 0-100 number; round to integer.
  const opportunityBlock = c.topOpportunityClusters.length > 0
    ? `Top prompt-cluster opportunities (highest opportunity score):
${c.topOpportunityClusters.map((o, i) => `${i + 1}. ${o.cluster} - score ${Math.round(o.score)}`).join('\n')}`
    : 'Top prompt-cluster opportunities: none reported in period.'

  // FB-031: section labels marked with "USE THESE EXACT VALUES" + the metric
  // semantics are spelled out so Glean cannot reinterpret. The numeric values
  // remain the literal source of truth; do not soften them.
  return `
Period: ${dateRange}
Data sources: Peec AI (visibility, citations, editorial domains), PR Proof Library (placements), GA4 (AI referral sessions)

Brand performance in AI answers (USE THESE EXACT VALUES):
- AI Visibility: ${visStr} (vs prior period: ${visDeltaStr})
- Average AI Position: ${posStr} (vs prior: ${posDeltaStr})
- Total AI Citations: ${c.totalAiCitations.toLocaleString()}

PR placement performance (USE THESE EXACT VALUES):
- Total PR placements in period: ${c.totalPlacements}
- Placements cited by AI engines: ${c.placementsCitedByAI} of ${c.totalPlacements} (${citationRate})

AI referral traffic (GA4):
- Sessions from AI sources: ${aiRefStr} (vs prior period: ${aiRefDeltaStr})

Editorial coverage (USE THESE EXACT VALUES):
- Total editorial domains cited by AI in this period: ${c.totalEditorialDomains}
- Distinct editorial hosts with at least one brand-absent AI-cited URL in this period: ${c.brandAbsentCount}

${brandAbsentBlock}

${opportunityBlock}
`.trim()
}

// Robust JSON extractor. Glean responses may include markdown fences or
// commentary around the JSON object. Tries direct parse, then code-fence
// stripping, then the first-{...last-} substring as a final fallback.
// Same shape as the Overview synopsis extractor.
function extractJsonObject(raw: string): PRInfluenceSynopsis {
  const tryParse = (s: string): PRInfluenceSynopsis | null => {
    try {
      const obj = JSON.parse(s) as PRInfluenceSynopsis
      if (typeof obj.synopsis === 'string' && Array.isArray(obj.actions)) return obj
      return null
    } catch {
      return null
    }
  }

  const direct = tryParse(raw.trim())
  if (direct) return direct

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced && fenced[1]) {
    const inner = tryParse(fenced[1].trim())
    if (inner) return inner
  }

  const first = raw.indexOf('{')
  const last  = raw.lastIndexOf('}')
  if (first !== -1 && last > first) {
    const span = tryParse(raw.slice(first, last + 1))
    if (span) return span
  }

  throw new Error('Glean response did not contain a parseable PR Influence synopsis object')
}

/**
 * FB-031 — Post-Glean grounding validator.
 *
 * Scans the synopsis prose for numeric claims about specific metrics and
 * verifies each one matches the corresponding context value. Catches the
 * exact class of failure observed in production: Glean producing "0
 * editorial domains where the brand was absent" while the source context
 * said brandAbsentCount = 5.
 *
 * Returns the violations the prompt-level integrity rule failed to prevent.
 * Caller decides whether to retry, fall back, or throw. Pure function for
 * straightforward unit testing.
 *
 * Pattern coverage chosen by what is most likely to slip past the prompt:
 * (1) "N | no | zero editorial (domains|hosts|outlets|sources) where (the)
 *      brand is/was absent" → compared to context.brandAbsentCount
 * (2) "AI cited N editorial domains" → compared to context.totalEditorialDomains
 * (3) "N of M placements" → compared to context.placementsCitedByAI of
 *      context.totalPlacements
 *
 * Intentionally narrow: false positives waste retries; false negatives let
 * one bug slip through. We catch the patterns that actually broke + the
 * adjacent risk patterns. Other metrics carry less semantic ambiguity and
 * stay un-validated for now.
 */
export function validateSynopsisGrounding(
  synopsis: string,
  context: PRInfluenceSynopsisContext,
): { ok: boolean; violations: string[] } {
  const violations: string[] = []

  // Rule 1 — brand-absent host count (the bug we just hit).
  const brandAbsentRe = /\b(\d+|no|zero)\s+editorial\s+(?:domains?|hosts?|outlets?|sources?)\s+where\s+(?:the\s+)?brand\s+(?:is|was)\s+absent/i
  const m = synopsis.match(brandAbsentRe)
  if (m) {
    const claimedRaw = m[1].toLowerCase()
    const claimedNum = claimedRaw === 'no' || claimedRaw === 'zero' ? 0 : parseInt(claimedRaw, 10)
    if (claimedNum !== context.brandAbsentCount) {
      violations.push(
        `brandAbsentCount mismatch: prose claims "${m[0]}" but context.brandAbsentCount = ${context.brandAbsentCount}`,
      )
    }
  }

  // Rule 2 — total editorial domains cited by AI.
  const editorialRe = /\bAI\s+cited\s+(\d+)\s+editorial\s+domains?\b/i
  const e = synopsis.match(editorialRe)
  if (e) {
    const claimed = parseInt(e[1], 10)
    if (claimed !== context.totalEditorialDomains) {
      violations.push(
        `totalEditorialDomains mismatch: prose claims "${e[0]}" but context.totalEditorialDomains = ${context.totalEditorialDomains}`,
      )
    }
  }

  // Rule 3 — placements cited "N of M".
  const placementRe = /\b(\d+)\s+of\s+(\d+)\s+placements?\b/i
  const p = synopsis.match(placementRe)
  if (p) {
    const claimedCited = parseInt(p[1], 10)
    const claimedTotal = parseInt(p[2], 10)
    if (
      claimedCited !== context.placementsCitedByAI ||
      claimedTotal !== context.totalPlacements
    ) {
      violations.push(
        `placement count mismatch: prose claims "${p[0]}" but context = ${context.placementsCitedByAI} of ${context.totalPlacements}`,
      )
    }
  }

  return { ok: violations.length === 0, violations }
}

const MAX_GENERATION_ATTEMPTS = 2

async function getPRInfluenceSynopsisImpl(
  clientSlug: string | undefined,
  dateRange: string,
  context: PRInfluenceSynopsisContext,
): Promise<PRInfluenceSynopsis> {
  const dataSection = buildContext({ context, dateRange })

  let lastViolations: string[] = []

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    const violationsNote =
      attempt > 1
        ? `\n\nIMPORTANT: A previous attempt produced these data-integrity violations: ${lastViolations.join(' | ')}. Do not repeat them. Use the exact numbers from the Data section. If the value in the Data section is 0, write 0 in the prose. If it is 5, write 5.`
        : ''

    const prompt = `You are an executive analyst writing a concise overview for a marketing leadership team. Use the data below to write a 2 to 3 paragraph synopsis of how the brand's PR placements are translating into AI-engine visibility during the selected period, followed by 2 to 4 concrete recommended actions for the team. Focus on: how PR placements are converting to AI citations, where the brand is missing from key editorial domains, and which content or pitching moves would close those gaps.

Tone: executive, plain English, no jargon, no hype. Reference real numbers from the data. Do not fabricate metrics. If a metric is "n/a" or "not configured", do not invent a value. Do not use em-dashes; use periods and commas.

Number formatting (strict): Every number you output in prose must have at most 1 decimal place. Never echo raw floats with more than 1 decimal. Integers like placement counts stay as integers. Percentages render like "28.3%". Counts like "1,407" use thousands separators.

Data integrity (strict): Every numeric claim you make MUST match the corresponding value in the Data section below. Do not invent counts. Do not round a positive count to zero. Do not say "no" or "none" when a count is positive. Do not state a positive number when the count is zero. When the Data section lists distinct editorial hosts by name, the count of those hosts is authoritative; do not contradict it. If you cannot find a metric in the Data section, omit it entirely rather than guessing.${violationsNote}

Output strictly valid JSON in this shape, with no markdown fences and no commentary before or after:
{
  "synopsis": "Two to three short paragraphs separated by \\n\\n. No bullets. No headings.",
  "actions": ["Short action statement 1", "Short action statement 2", "..."]
}

Data:
${dataSection}`

    const raw = await gleanChat(prompt, { saveChat: false })
    const result = extractJsonObject(raw)

    const validation = validateSynopsisGrounding(result.synopsis, context)
    if (validation.ok) {
      return result
    }

    lastViolations = validation.violations
    console.warn(
      `[pr-influence-synopsis] attempt ${attempt} of ${MAX_GENERATION_ATTEMPTS} failed grounding validation:`,
      validation.violations,
    )
  }

  // Both attempts failed validation. Throw so the component error path renders
  // a graceful empty state ("Synopsis is temporarily unavailable") rather than
  // shipping prose that contradicts the rest of the page.
  throw new Error(
    `PR Influence synopsis failed grounding validation after ${MAX_GENERATION_ATTEMPTS} attempts: ${lastViolations.join(' | ')}`,
  )
}

// Cache key derives from positional args: clientSlug + dateRange + context.
// Next.js unstable_cache serializes args into the key, so a different context
// (e.g. brandAbsentCount changes from 0 to 5) produces a different cache key
// and forces a fresh fetch. Cache version is bumped whenever the prompt
// structure changes so older cached responses (generated under a weaker
// integrity rule) are evicted on deploy.
export const getPRInfluenceSynopsis = cached(
  'glean',
  'getPRInfluenceSynopsis',
  getPRInfluenceSynopsisImpl,
  {
    version: 'v3-glean-pri-grounded',  // FB-031: prompt integrity rule + post-Glean validator + retry-on-violation; flush v2 cache.
    ttlSeconds: 3600,
    extractTags: ([clientSlug, dateRange]) => ({
      client: clientSlug,
      dateRange,
    }),
  },
)
