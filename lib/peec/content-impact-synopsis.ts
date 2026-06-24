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

  // Rule 2, total AI citations (the headline §A KPI). Supports thousands
  // separators since buildContext() interpolates with toLocaleString().
  const citationsRe = /\b(\d{1,3}(?:,\d{3})*)\s+AI\s+citations?\b/i
  const c = synopsis.match(citationsRe)
  if (c) {
    const claimed = parseInt(c[1].replace(/,/g, ''), 10)
    if (claimed !== context.totalAiCitations) {
      violations.push(
        `totalAiCitations mismatch: prose claims "${c[0]}" but context.totalAiCitations = ${context.totalAiCitations}`,
      )
    }
  }

  // Rule 3, owned domains cited. Guards against rounding a positive count
  // to zero or saying "no owned domains cited" when the count is positive.
  const ownedRe = /\b(\d+|no|zero)\s+owned\s+domains?\s+(?:are\s+|were\s+)?cited/i
  const o = synopsis.match(ownedRe)
  if (o) {
    const claimedRaw = o[1].toLowerCase()
    const claimedNum = claimedRaw === 'no' || claimedRaw === 'zero' ? 0 : parseInt(claimedRaw, 10)
    if (claimedNum !== context.ownedDomainsCited) {
      violations.push(
        `ownedDomainsCited mismatch: prose claims "${o[0]}" but context.ownedDomainsCited = ${context.ownedDomainsCited}`,
      )
    }
  }

  return { ok: violations.length === 0, violations }
}

function buildContext(args: { context: ContentImpactSynopsisContext; dateRange: string }): string {
  const { context: c, dateRange } = args

  // FB-025: every numeric value rendered here uses toLocaleString() for
  // thousands separators (counts) or fixed-decimal (rates). No raw floats.
  const planned = c.plannedUrlsInScope != null ? c.plannedUrlsInScope.toLocaleString() : 'not configured'
  const live    = c.liveUrls != null ? c.liveUrls.toLocaleString() : 'not configured'
  const sess    = c.totalSessions != null ? c.totalSessions.toLocaleString() : 'not configured'
  const cites   = c.totalAiCitations.toLocaleString()
  const aiRef   = c.aiReferredSessions != null ? c.aiReferredSessions.toLocaleString() : 'not configured'
  const owned   = c.ownedUrlsWithAiActivity != null ? c.ownedUrlsWithAiActivity.toLocaleString() : 'not configured'
  const unmatch = c.unmatchedPct != null ? `${c.unmatchedPct}%` : 'not configured'
  const ownedDom = c.ownedDomainsCited.toLocaleString()

  // FB-025: round per-row counts to 1 decimal before interpolation.
  const ownedBlock = c.topOwnedDomainsByCitations.length > 0
    ? `Top owned domains by AI citations (highest first):
${c.topOwnedDomainsByCitations.map((d, i) => `${i + 1}. ${d.domain} - ${d.citationCount.toFixed(1)} AI citations`).join('\n')}`
    : 'Top owned domains by AI citations: none reported in period.'

  const compBlock = c.topCompetitorDomainsByCitations.length > 0
    ? `Top competitor domains by AI citations (highest first):
${c.topCompetitorDomainsByCitations.map((d, i) => `${i + 1}. ${d.domain} - ${d.citationCount.toFixed(1)} AI citations`).join('\n')}`
    : 'Top competitor domains by AI citations: none reported in period.'

  const brandAbsentBlock = c.topBrandAbsentCompetitorUrls.length > 0
    ? `Top competitor or third-party URLs where the brand is absent (highest AI citation count):
${c.topBrandAbsentCompetitorUrls.map((u, i) => `${i + 1}. ${u.url} (${u.host}) - ${u.citationCount.toFixed(1)} AI citations`).join('\n')}`
    : 'Top competitor or third-party URLs where the brand is absent: none reported in period.'

  // FB-031: section labels marked "USE THESE EXACT VALUES" + metric semantics
  // spelled out so Glean cannot reinterpret. Numeric values are the literal
  // source of truth.
  return `
Period: ${dateRange}
Data sources: Peec AI (citations, owned/competitor domains, brand-absent URL set), GA4 (sessions, AI-referred sessions), Bot Analytics (owned URLs with AI activity), Content Calendar (planned and live URLs)

Content footprint in scope (USE THESE EXACT VALUES):
- Planned URLs in scope (content calendar): ${planned}
- Live URLs (matched or discoverable): ${live}
- Percent null or unmatched (planned content with no data): ${unmatch}

Human and AI traffic to owned content (USE THESE EXACT VALUES):
- Total Sessions (GA4, all sources): ${sess}
- AI-Referred Sessions (GA4, AI-source sessions): ${aiRef}

Owned-content AI footprint (USE THESE EXACT VALUES):
- Total AI Citations across owned domains: ${cites}
- Owned URLs with AI bot activity (crawled in 30d): ${owned}
- Distinct owned domains cited in AI: ${ownedDom}

Competitor and third-party AI footprint (USE THESE EXACT VALUES):
- Distinct competitor or third-party URLs where the brand is absent: ${c.brandAbsentCompetitorUrlCount}

${ownedBlock}

${compBlock}

${brandAbsentBlock}
`.trim()
}

// Robust JSON extractor. Glean responses may include markdown fences or
// commentary around the JSON object. Tries direct parse, then code-fence
// stripping, then the first-{...last-} substring as a final fallback.
// Same shape as the PR Influence synopsis extractor.
function extractJsonObject(raw: string): ContentImpactSynopsis {
  const tryParse = (s: string): ContentImpactSynopsis | null => {
    try {
      const obj = JSON.parse(s) as ContentImpactSynopsis
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

  throw new Error('Glean response did not contain a parseable Content Impact synopsis object')
}

const MAX_GENERATION_ATTEMPTS = 2

async function getContentImpactSynopsisImpl(
  clientSlug: string | undefined,
  dateRange: string,
  context: ContentImpactSynopsisContext,
): Promise<ContentImpactSynopsis> {
  void clientSlug
  const dataSection = buildContext({ context, dateRange })

  let lastViolations: string[] = []

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    const violationsNote =
      attempt > 1
        ? `\n\nIMPORTANT: A previous attempt produced these data-integrity violations: ${lastViolations.join(' | ')}. Do not repeat them. Use the exact numbers from the Data section. If the value in the Data section is 0, write 0 in the prose. If it is 5, write 5.`
        : ''

    const prompt = `You are an executive analyst writing a concise overview for a marketing leadership team. Use the data below to write a 2 to 3 paragraph synopsis of how the brand's content is performing across AI and human channels during the selected period, followed by 2 to 4 concrete recommended actions for the content team. Focus on: how owned content is earning AI citations, where AI-referred and total session traffic stands relative to the owned footprint, and where competitors or third-party publishers are winning AI placements the brand is absent from.

Tone: executive, plain English, no jargon, no hype. Reference real numbers from the data. Do not fabricate metrics. If a metric is "not configured", do not invent a value. Do not use em-dashes; use periods and commas.

Number formatting (strict): Every number you output in prose must have at most 1 decimal place. Never echo raw floats with more than 1 decimal. Integers like URL counts stay as integers. Percentages render like "10%". Counts like "1,407" use thousands separators.

Data integrity (strict): Every numeric claim you make MUST match the corresponding value in the Data section below. Do not invent counts. Do not round a positive count to zero. Do not say "no" or "none" when a count is positive. Do not state a positive number when the count is zero. When the Data section lists distinct competitor URLs by name, the count of those URLs is authoritative; do not contradict it. If you cannot find a metric in the Data section, omit it entirely rather than guessing.${violationsNote}

Output strictly valid JSON in this shape, with no markdown fences and no commentary before or after:
{
  "synopsis": "Two to three short paragraphs separated by \\n\\n. No bullets. No headings.",
  "actions": ["Short action statement 1", "Short action statement 2", "..."]
}

Data:
${dataSection}`

    const raw = await gleanChat(prompt, { saveChat: false })
    const result = extractJsonObject(raw)

    const validation = validateContentImpactSynopsisGrounding(result.synopsis, context)
    if (validation.ok) {
      return result
    }

    lastViolations = validation.violations
    console.warn(
      `[content-impact-synopsis] attempt ${attempt} of ${MAX_GENERATION_ATTEMPTS} failed grounding validation:`,
      validation.violations,
    )
  }

  throw new Error(
    `Content Impact synopsis failed grounding validation after ${MAX_GENERATION_ATTEMPTS} attempts: ${lastViolations.join(' | ')}`,
  )
}

// Cache key derives from positional args: clientSlug + dateRange + context.
// Next.js unstable_cache serializes args into the key, so a different context
// (e.g. totalAiCitations changes) produces a different cache key and forces
// a fresh fetch. Cache version 'v1-glean-ci' is the first cached version of
// this helper; future prompt or schema changes must bump it to flush.
export const getContentImpactSynopsis = cached(
  'glean',
  'getContentImpactSynopsis',
  getContentImpactSynopsisImpl,
  {
    version: 'v1-glean-ci',
    ttlSeconds: 3600,
    extractTags: ([clientSlug, dateRange]) => ({
      client: clientSlug,
      dateRange,
    }),
  },
)
