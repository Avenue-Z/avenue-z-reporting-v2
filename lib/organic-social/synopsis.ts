import { cached } from '@/lib/cache'
import { gleanChat } from '@/lib/glean'
import type { PlatformHeadline, TrendSeries, PlatformTopContent } from './types'

// Executive synopsis + recommended actions for the Organic Social section.
// Mirrors lib/peec/synopsis.ts: Glean-backed, cached per (clientSlug, dateRange)
// for one hour. Server-side only.

export type OverviewSynopsis = { synopsis: string; actions: string[] }

export function buildSocialContext(args: {
  headlines: PlatformHeadline[]
  trend: TrendSeries
  top: PlatformTopContent[]
  dateRange: string
}): string {
  const { headlines, trend, top, dateRange } = args
  const fmt = (n: number) => n.toLocaleString()
  const delta = (v?: number) => (v == null ? '' : ` (vs prior: ${v >= 0 ? '+' : ''}${v.toFixed(1)}%)`)

  const perPlatform = headlines.map((h) =>
    `- ${h.label}: ${fmt(h.followers)} followers${delta(h.deltas?.followers)}, ` +
    `${fmt(h.netNewFollowers)} net new${delta(h.deltas?.netNewFollowers)}, ` +
    `${fmt(h.exposure)} ${h.exposureLabel.toLowerCase()}${delta(h.deltas?.exposure)}, ` +
    `${fmt(h.engagements)} engagements${delta(h.deltas?.engagements)}, ` +
    `${h.engagementRate.toFixed(1)}% engagement rate${delta(h.deltas?.engagementRate)}`,
  ).join('\n')

  const topLines = top.flatMap((g) =>
    g.rows.slice(0, 3).map((r) => `- ${g.platform}: "${r.caption.slice(0, 80)}" — ${fmt(r.engagements)} engagements, ${fmt(r.views)} views`),
  ).join('\n')

  return `
Period: ${dateRange}
Channels tracked: ${trend.channels.join(', ') || 'n/a'}

Per-platform performance:
${perPlatform || 'n/a'}

Top performing posts:
${topLines || 'n/a'}
`.trim()
}

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
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced && fenced[1]) {
    const inner = tryParse(fenced[1].trim())
    if (inner) return inner
  }
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first !== -1 && last > first) {
    const span = tryParse(raw.slice(first, last + 1))
    if (span) return span
  }
  throw new Error('Glean response did not contain a parseable Organic Social synopsis object')
}

async function getOrganicSocialSynopsisImpl(
  clientSlug: string | undefined,
  dateRange: string,
  headlines: PlatformHeadline[],
  trend: TrendSeries,
  top: PlatformTopContent[],
): Promise<OverviewSynopsis> {
  const context = buildSocialContext({ headlines, trend, top, dateRange })

  const prompt = `You are an executive analyst writing a concise overview for a marketing leadership team. Use the data below to write a 2 to 3 paragraph synopsis of how the brand's organic social channels performed during the selected period, followed by 2 to 4 concrete recommended actions for the team.

Tone: executive, plain English, no jargon, no hype. Reference real numbers from the data. Do not fabricate metrics. If a value is "n/a", do not invent one. Do not use em-dashes; use periods and commas.

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

export const getOrganicSocialSynopsis = cached(
  'glean',
  'getOrganicSocialSynopsis',
  getOrganicSocialSynopsisImpl,
  {
    version: 'v1-glean',
    ttlSeconds: 3600,
    extractTags: ([clientSlug, dateRange]) => ({ client: clientSlug, dateRange }),
  },
)
