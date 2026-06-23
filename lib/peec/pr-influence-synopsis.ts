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
  // The Peec `retrieved` field is a float percentage; Glean echoed raw floats
  // like "2.6297537434931484 AI citations" into the prose verbatim.
  const brandAbsentBlock = c.topBrandAbsentDomains.length > 0
    ? `Top editorial domains citing AI but missing your brand (highest AI citation count):
${c.topBrandAbsentDomains.map((d, i) => `${i + 1}. ${d.domain} - ${d.citationCount.toFixed(1)} AI citations`).join('\n')}`
    : 'Top editorial domains where brand is absent: none reported in period.'

  // FB-025: opportunity score is a derived 0-100 number; round to integer.
  const opportunityBlock = c.topOpportunityClusters.length > 0
    ? `Top prompt-cluster opportunities (highest opportunity score):
${c.topOpportunityClusters.map((o, i) => `${i + 1}. ${o.cluster} - score ${Math.round(o.score)}`).join('\n')}`
    : 'Top prompt-cluster opportunities: none reported in period.'

  return `
Period: ${dateRange}
Data sources: Peec AI (visibility, citations, editorial domains), PR Proof Library (placements), GA4 (AI referral sessions)

Brand performance in AI answers:
- AI Visibility: ${visStr} (vs prior period: ${visDeltaStr})
- Average AI Position: ${posStr} (vs prior: ${posDeltaStr})
- Total AI Citations: ${c.totalAiCitations.toLocaleString()}

PR placement performance:
- Total PR placements in period: ${c.totalPlacements}
- Placements cited by AI engines: ${c.placementsCitedByAI} of ${c.totalPlacements} (${citationRate})

AI referral traffic (GA4):
- Sessions from AI sources: ${aiRefStr} (vs prior period: ${aiRefDeltaStr})

Editorial coverage:
- Total editorial domains cited by AI: ${c.totalEditorialDomains}
- Editorial domains where your brand is absent: ${c.brandAbsentCount}

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

async function getPRInfluenceSynopsisImpl(
  clientSlug: string | undefined,
  dateRange: string,
  context: PRInfluenceSynopsisContext,
): Promise<PRInfluenceSynopsis> {
  const dataSection = buildContext({ context, dateRange })

  const prompt = `You are an executive analyst writing a concise overview for a marketing leadership team. Use the data below to write a 2 to 3 paragraph synopsis of how the brand's PR placements are translating into AI-engine visibility during the selected period, followed by 2 to 4 concrete recommended actions for the team. Focus on: how PR placements are converting to AI citations, where the brand is missing from key editorial domains, and which content or pitching moves would close those gaps.

Tone: executive, plain English, no jargon, no hype. Reference real numbers from the data. Do not fabricate metrics. If a metric is "n/a" or "not configured", do not invent a value. Do not use em-dashes; use periods and commas.

Number formatting (strict): Every number you output in prose must have at most 1 decimal place. Never echo raw floats with more than 1 decimal. Integers like placement counts stay as integers. Percentages render like "28.3%". Counts like "1,407" use thousands separators.

Output strictly valid JSON in this shape, with no markdown fences and no commentary before or after:
{
  "synopsis": "Two to three short paragraphs separated by \\n\\n. No bullets. No headings.",
  "actions": ["Short action statement 1", "Short action statement 2", "..."]
}

Data:
${dataSection}`

  const raw = await gleanChat(prompt, { saveChat: false })
  return extractJsonObject(raw)
}

// Cache key derives from positional args: clientSlug + dateRange uniquely
// identify the synopsis. The context arg is passed for the prompt but the
// cache wrapper keys on the primitive args only. Context varies in step
// with dateRange so the cache key is sufficient. One-hour TTL.
export const getPRInfluenceSynopsis = cached(
  'glean',
  'getPRInfluenceSynopsis',
  getPRInfluenceSynopsisImpl,
  {
    version: 'v2-glean-pri',  // FB-025: rounded numerics in buildContext + stricter prompt format rule
    ttlSeconds: 3600,
    extractTags: ([clientSlug, dateRange]) => ({
      client: clientSlug,
      dateRange,
    }),
  },
)
