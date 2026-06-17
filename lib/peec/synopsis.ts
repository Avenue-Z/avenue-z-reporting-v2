import { GoogleGenAI } from '@google/genai'
import { cached } from '@/lib/cache'
import type { PeecOverview } from './client'
import type { ProfoundOverview } from '@/lib/profound/client'

// Executive synopsis + recommended actions for the AEO Overview tab.
// Calls Vertex Gemini and is cached per (clientSlug, dateRange, provider) for
// one hour so the page stays fast and the LLM is not re-invoked on every
// render. Same Vertex wiring as lib/bigquery/gemini.ts.

export type OverviewSynopsis = {
  synopsis: string
  actions: string[]
}

const PROJECT_ID = process.env.BQ_PROJECT_ID
let _client: GoogleGenAI | null = null
function getClient(): GoogleGenAI {
  if (!_client) {
    _client = new GoogleGenAI({ vertexai: true, project: PROJECT_ID!, location: 'global' })
  }
  return _client
}

type AnyOverview = PeecOverview | ProfoundOverview

function buildContext(args: {
  data: AnyOverview
  provider: 'peec' | 'profound'
  dateRange: string
  aiSessions: number | null
}): string {
  const { data, provider, dateRange, aiSessions } = args
  const you = data.brandRankings.find(b => b.isYou)
  const top5Brands = data.brandRankings.slice(0, 5)
  const top5Domains = data.topDomains.slice(0, 5)
  const citationSharePct = data.totalCitations > 0
    ? ((data.yourBrandCitations / data.totalCitations) * 100).toFixed(1)
    : 'n/a'
  const citationShareDeltaPct = data.totalCitationsPrior > 0
    ? (((data.yourBrandCitations / data.totalCitations) * 100) - ((data.yourBrandCitationsPrior / data.totalCitationsPrior) * 100)).toFixed(1)
    : 'n/a'

  return `
Period: ${dateRange}
Data source: ${provider === 'peec' ? 'Peec AI' : 'Profound'}

Your brand snapshot:
- Visibility: ${you ? you.visibility.toFixed(1) + '%' : 'n/a'} (vs prior period: ${you ? (you.visibilityDelta >= 0 ? '+' : '') + you.visibilityDelta.toFixed(1) + 'pp' : 'n/a'})
- Share of Voice: ${you ? you.sov.toFixed(1) + '%' : 'n/a'}
- Average Position: ${you ? '#' + you.position.toFixed(1) : 'n/a'}
- Citation Share: ${citationSharePct}% (vs prior: ${citationShareDeltaPct}pp)
- Citations attributed to your domain: ${data.yourBrandCitations.toLocaleString()} of ${data.totalCitations.toLocaleString()} tracked
- AI Referral Traffic (GA4 sessions from AI sources): ${aiSessions != null ? aiSessions.toLocaleString() : 'not configured'}

Top tracked brands by visibility:
${top5Brands.map((b, i) => `${i + 1}. ${b.name}${b.isYou ? ' (you)' : ''} — ${b.visibility.toFixed(1)}% visibility, ${b.sov.toFixed(1)}% SoV`).join('\n')}

Top cited domains:
${top5Domains.map((d, i) => `${i + 1}. ${d.domain} — ${d.retrieved.toFixed(1)}% retrieved`).join('\n')}

Competitor averages:
- Visibility: ${data.competitorAverages.visibility.toFixed(1)}%
- Share of Voice: ${data.competitorAverages.sov.toFixed(1)}%
- Position: #${data.competitorAverages.position.toFixed(1)}
`.trim()
}

async function getOverviewSynopsisImpl(
  clientSlug: string | undefined,
  dateRange: string,
  provider: 'peec' | 'profound',
  data: AnyOverview,
  aiSessions: number | null,
): Promise<OverviewSynopsis> {
  if (!PROJECT_ID) {
    throw new Error('BQ_PROJECT_ID is not set; cannot call Vertex Gemini.')
  }

  const context = buildContext({ data, provider, dateRange, aiSessions })

  const prompt = `You are an executive analyst writing a concise overview for a marketing leadership team. Use the data below to write a 2 to 3 paragraph synopsis of how the brand is performing in AI answer engines during the selected period, followed by 2 to 4 concrete recommended actions for the team.

Tone: executive, plain English, no jargon, no hype. Reference real numbers from the data. Do not fabricate metrics. If a metric is "n/a" or "not configured", do not invent a value. Do not use em-dashes; use periods and commas.

Output strictly valid JSON in this shape:
{
  "synopsis": "Two to three short paragraphs separated by \\n\\n. No bullets. No headings.",
  "actions": ["Short action statement 1", "Short action statement 2", "..."]
}

Data:
${context}`

  const client = getClient()
  const response = await client.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: prompt,
    config: {
      temperature: 0.4,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
    },
  })

  const text = response.text
  if (!text) throw new Error('Gemini returned empty content for Overview synopsis')

  const parsed = JSON.parse(text) as OverviewSynopsis
  if (typeof parsed.synopsis !== 'string' || !Array.isArray(parsed.actions)) {
    throw new Error('Gemini returned malformed Overview synopsis')
  }
  return parsed
}

// Cache key derives from positional args: clientSlug + dateRange + provider
// uniquely identify the synopsis. The data and aiSessions are passed but the
// cache wrapper keys on the primitive args. One-hour TTL.
export const getOverviewSynopsis = cached(
  'gemini',
  'getOverviewSynopsis',
  getOverviewSynopsisImpl,
  {
    version: 'v1',
    ttlSeconds: 3600,
    extractTags: ([clientSlug, dateRange, provider]) => ({
      client: clientSlug,
      dateRange,
      provider,
    }),
  },
)
