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
  // §A KPI values (FB-034, what the page renders).
  citationSharePct: number | null
  citationSharePctDelta: number | null
  promptCoveragePct: number | null
  aiReferralTraffic: number | null
  aiReferralTrafficDelta: number | null
  organicTraffic: number | null
  organicTrafficDelta: number | null

  // Supporting context (prose grounding + validator inputs).
  totalAiCitations: number                // validator Rule 2
  yourBrandCitations: number
  totalCitationsAllDomains: number
  ownedDomainsCited: number               // validator Rule 3

  // Top-items lists (unchanged from FB-033).
  topOwnedDomainsByCitations: Array<{ domain: string; citationCount: number }>
  topCompetitorDomainsByCitations: Array<{ domain: string; citationCount: number }>
  topBrandAbsentCompetitorUrls: Array<{ url: string; host: string; citationCount: number }>
  brandAbsentCompetitorUrlCount: number   // validator Rule 1
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

  // Rule 2 removed (FB-034 hotfix). The pattern /N AI citations/ was too
  // broad: with totalAiCitations + yourBrandCitations + per-domain counts
  // all in the context, Glean naturally writes "example.com earned 3,196
  // AI citations" referring to a per-domain or your-brand subset, and
  // the regex wrongly treats it as a total claim. The USE THESE EXACT
  // VALUES prompt label still anchors the total; a future FB can add a
  // narrower Rule 2 if a real total-misreporting bug appears.

  // Rule 3 (was Rule 3, now the second rule), owned domains cited.
  // Guards against rounding a positive count
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
  const citShare = c.citationSharePct != null ? `${c.citationSharePct.toFixed(1)}%` : 'not configured'
  const citShareDelta = c.citationSharePctDelta != null
    ? `${c.citationSharePctDelta >= 0 ? '+' : ''}${c.citationSharePctDelta.toFixed(1)}pp`
    : 'n/a'
  const promptCov = c.promptCoveragePct != null ? `${c.promptCoveragePct}%` : 'not configured'
  const aiRef = c.aiReferralTraffic != null ? c.aiReferralTraffic.toLocaleString() : 'not configured'
  const aiRefDelta = c.aiReferralTrafficDelta != null
    ? `${c.aiReferralTrafficDelta >= 0 ? '+' : ''}${c.aiReferralTrafficDelta.toFixed(1)}%`
    : 'n/a'
  const organic = c.organicTraffic != null ? c.organicTraffic.toLocaleString() : 'not configured'
  const organicDelta = c.organicTrafficDelta != null
    ? `${c.organicTrafficDelta >= 0 ? '+' : ''}${c.organicTrafficDelta.toFixed(1)}%`
    : 'n/a'
  const cites = c.totalAiCitations.toLocaleString()
  const yourBrand = c.yourBrandCitations.toLocaleString()
  const totalCites = c.totalCitationsAllDomains.toLocaleString()
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

  return `
Period: ${dateRange}
Data sources: Peec AI (citations, owned/competitor domains, brand-absent URL set), GA4 (sessions by source and channel grouping for AI Referral Traffic and Organic Traffic)

Snapshot KPIs for the period (USE THESE EXACT VALUES):
- Citation Share (owned share of total AI citations): ${citShare} (vs prior period: ${citShareDelta})
- Prompt Coverage (tracked prompts citing owned domains): ${promptCov}
- AI Referral Traffic (GA4 sessions from AI sources): ${aiRef} (vs prior period: ${aiRefDelta})
- Organic Traffic (GA4 Organic Search channel sessions): ${organic} (vs prior period: ${organicDelta})

Owned-content AI footprint (USE THESE EXACT VALUES):
- Total AI Citations across owned domains: ${cites}
- Your-brand citation numerator: ${yourBrand}
- All-domains citation denominator: ${totalCites}
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
// (e.g. citationSharePct changes) produces a different cache key and forces
// a fresh fetch. Cache version 'v2-glean-ci-kpi-swap' is the FB-034 schema
// (4 new KPIs replace 8 old ones); FB-033's v1 cache is evicted on deploy.
export const getContentImpactSynopsis = cached(
  'glean',
  'getContentImpactSynopsis',
  getContentImpactSynopsisImpl,
  {
    version: 'v3-glean-ci-rule2-removed',
    ttlSeconds: 3600,
    extractTags: ([clientSlug, dateRange]) => ({
      client: clientSlug,
      dateRange,
    }),
  },
)
