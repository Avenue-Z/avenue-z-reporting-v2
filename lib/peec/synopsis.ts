import { cached } from '@/lib/cache'
import { gleanChat } from '@/lib/glean'
import type { PeecOverview } from './client'
import type { ProfoundOverview } from '@/lib/profound/client'

// Executive synopsis + recommended actions for the AEO Overview tab.
// Calls the Avenue Z Glean Chat API (the only sanctioned LLM provider for
// this project) and is cached per (clientSlug, dateRange, provider) for one
// hour so the page stays fast and Glean is not re-invoked on every render.

export type OverviewSynopsis = {
  synopsis: string
  actions: string[]
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
${top5Brands.map((b, i) => `${i + 1}. ${b.name}${b.isYou ? ' (you)' : ''} - ${b.visibility.toFixed(1)}% visibility, ${b.sov.toFixed(1)}% SoV`).join('\n')}

Top cited domains:
${top5Domains.map((d, i) => `${i + 1}. ${d.domain} - ${d.retrieved.toFixed(1)}% retrieved`).join('\n')}

Competitor averages:
- Visibility: ${data.competitorAverages.visibility.toFixed(1)}%
- Share of Voice: ${data.competitorAverages.sov.toFixed(1)}%
- Position: #${data.competitorAverages.position.toFixed(1)}
`.trim()
}

// Robust JSON extractor. Glean responses may include markdown fences or
// commentary around the JSON object. Tries direct parse, then code-fence
// stripping, then the first-{...last-} substring as a final fallback.
function extractJsonObject(raw: string): OverviewSynopsis {
  const tryParse = (s: string): OverviewSynopsis | null => {
    try {
      const obj = JSON.parse(s) as OverviewSynopsis
      if (typeof obj.synopsis === 'string' && Array.isArray(obj.actions)) return obj
      return null
    } catch {
      return null
    }
  }

  const direct = tryParse(raw.trim())
  if (direct) return direct

  // Strip ```json ... ``` or ``` ... ``` fences.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced && fenced[1]) {
    const inner = tryParse(fenced[1].trim())
    if (inner) return inner
  }

  // Last resort: grab the widest {...} span.
  const first = raw.indexOf('{')
  const last  = raw.lastIndexOf('}')
  if (first !== -1 && last > first) {
    const span = tryParse(raw.slice(first, last + 1))
    if (span) return span
  }

  throw new Error('Glean response did not contain a parseable Overview synopsis object')
}

async function getOverviewSynopsisImpl(
  clientSlug: string | undefined,
  dateRange: string,
  provider: 'peec' | 'profound',
  data: AnyOverview,
  aiSessions: number | null,
): Promise<OverviewSynopsis> {
  const context = buildContext({ data, provider, dateRange, aiSessions })

  const prompt = `You are an executive analyst writing a concise overview for a marketing leadership team. Use the data below to write a 2 to 3 paragraph synopsis of how the brand is performing in AI answer engines during the selected period, followed by 2 to 4 concrete recommended actions for the team.

Tone: executive, plain English, no jargon, no hype. Reference real numbers from the data. Do not fabricate metrics. If a metric is "n/a" or "not configured", do not invent a value. Do not use em-dashes; use periods and commas.

Output strictly valid JSON in this shape, with no markdown fences and no commentary before or after:
{
  "synopsis": "Two to three short paragraphs separated by \\n\\n. No bullets. No headings.",
  "actions": ["Short action statement 1", "Short action statement 2", "..."]
}

Data:
${context}`

  const raw = await gleanChat(prompt, { saveChat: false })
  return extractJsonObject(raw)
}

// Cache key derives from positional args: clientSlug + dateRange + provider
// uniquely identify the synopsis. The data and aiSessions args are passed
// for the prompt but the cache wrapper keys on the primitive args. The data
// already varies in step with dateRange (and demo mode) so the cache key is
// sufficient. One-hour TTL.
export const getOverviewSynopsis = cached(
  'glean',
  'getOverviewSynopsis',
  getOverviewSynopsisImpl,
  {
    version: 'v2-glean',
    ttlSeconds: 3600,
    extractTags: ([clientSlug, dateRange, provider]) => ({
      client: clientSlug,
      dateRange,
      provider,
    }),
  },
)
