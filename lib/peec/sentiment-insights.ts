// lib/peec/sentiment-insights.ts
// FB-026: live Glean-backed sentiment classification + theme extraction for
// the AEO PR Influence Sentiment Insights card. Mirrors the canonical pattern
// in lib/peec/synopsis.ts: single-shot Glean Chat call, strict-JSON output,
// three-tier extractor, cached per (clientSlug, dateRange, modelKey) for 1h.
//
// Tina v1 CSV R4 + R5: the card was hardcoded Avenue Z sandbox content with
// no data flow. This module wires it to the real per-URL citation data
// (UrlCitation[] from lib/peec/url-citations.ts) and produces a per-period
// per-model sentiment readout that the component renders verbatim.
import { cached } from '@/lib/cache'
import { gleanChat } from '@/lib/glean'
import type { UrlCitation } from '@/lib/peec/url-citations'
import type { AEOModel } from '@/lib/peec/models'

export type SentimentTheme = { title: string; urls: string[] }
export type SentimentNegativeTheme = { title: string; explanation: string; urls: string[] }

export type SentimentInsights = {
  sentimentPct: number   // 0-100, share of analyzed URLs classified as positive
  positiveThemes: SentimentTheme[]
  negativeThemes: SentimentNegativeTheme[]
  analyzedUrlCount: number  // how many URLs went into the analysis (for trust)
}

export type SentimentInsightsContext = {
  citations: UrlCitation[]  // already filtered to period + model by the caller
}

/**
 * Filter URL citations to only those cited by at least one of the selected
 * AI engines. With `models=null`, returns the input unchanged. Mirrors the
 * filteredMatchbackRows logic in pr-influence.tsx: URLs with no engines at
 * all are DROPPED when a filter is active (no model-specific signal).
 */
export function applyEnginesFilter(
  citations: UrlCitation[],
  models: AEOModel[] | null,
): UrlCitation[] {
  if (!models || models.length === 0) return citations
  const set = new Set<string>(models)
  return citations.filter((c) => c.engines.length > 0 && c.engines.some((e) => set.has(e)))
}

/**
 * Build the data block fed into the Glean prompt. Caps at 60 URLs to keep
 * the prompt size bounded. Sort by citationCount desc so the most cited URLs
 * always make it into the analysis.
 */
function buildContext(args: { citations: UrlCitation[]; dateRange: string }): string {
  const { citations, dateRange } = args
  const ranked = [...citations].sort((a, b) => b.citationCount - a.citationCount).slice(0, 60)
  const lines = ranked.map((c, i) => {
    const titleStr = c.title ? c.title.replace(/\s+/g, ' ').trim().slice(0, 200) : '(no title)'
    return `${i + 1}. URL: ${c.url}\n   Title: ${titleStr}\n   Domain: ${c.domain}\n   Mentions your brand: ${c.mentionsYourBrand ? 'yes' : 'no'}\n   Engines citing: ${c.engines.length > 0 ? c.engines.join(', ') : 'unknown'}`
  })
  return `
Period: ${dateRange}
Analyzed citations: ${ranked.length} (top by citation count from ${citations.length} total AI-cited URLs)

Citations:
${lines.join('\n\n')}
`.trim()
}

function extractJsonObject(raw: string): SentimentInsights {
  const tryParse = (s: string): SentimentInsights | null => {
    try {
      const obj = JSON.parse(s) as Partial<SentimentInsights>
      if (
        typeof obj.sentimentPct === 'number' &&
        Array.isArray(obj.positiveThemes) &&
        Array.isArray(obj.negativeThemes) &&
        typeof obj.analyzedUrlCount === 'number'
      ) {
        return obj as SentimentInsights
      }
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

  throw new Error('Glean response did not contain a parseable Sentiment Insights object')
}

const EMPTY: SentimentInsights = {
  sentimentPct: 0,
  positiveThemes: [],
  negativeThemes: [],
  analyzedUrlCount: 0,
}

async function getSentimentInsightsImpl(
  _clientSlug: string | undefined,
  dateRange: string,
  _modelKey: string,
  context: SentimentInsightsContext,
): Promise<SentimentInsights> {
  if (context.citations.length === 0) return EMPTY

  const dataSection = buildContext({ citations: context.citations, dateRange })

  const prompt = `You are a senior brand-analyst reading AI-cited articles to classify how each one talks about a brand. Use ONLY the URLs and titles below. Do not invent sources, themes, or claims.

For each URL, decide if its tone toward the brand is positive, negative, or neutral, based on the title and what the URL implies. Then group the positive URLs into a small number of distinct themes (3 to 8), each with a short title that names the positive pattern. Do the same for negative URLs (0 to 4 themes). Each theme must reference the actual URLs it groups.

Tone: plain English, no jargon. Do not use em-dashes; use periods and commas. Theme titles are short noun phrases like "Strong AI visibility gains" or "Unproven impact". Negative-theme explanations are one short sentence.

Output strictly valid JSON in this shape, with no markdown fences and no commentary before or after:
{
  "sentimentPct": 0-100 number representing the share of analyzed URLs classified as positive (round to 1 decimal),
  "positiveThemes": [{ "title": "short noun phrase", "urls": ["https://..."] }],
  "negativeThemes": [{ "title": "short noun phrase", "explanation": "one short sentence", "urls": ["https://..."] }],
  "analyzedUrlCount": integer number of URLs you actually classified
}

Data:
${dataSection}`

  const raw = await gleanChat(prompt, { saveChat: false })
  return extractJsonObject(raw)
}

/**
 * Cached entry point. Cache key derives from positional args:
 *   clientSlug + dateRange + modelKey
 * where modelKey is a stable sorted-joined string of selected models, or
 * "all" when no filter is active. context.citations is passed for the prompt
 * but the cache wrapper keys on the primitive args only — context varies in
 * lockstep with dateRange + modelKey. One-hour TTL.
 */
export const getSentimentInsights = cached(
  'glean',
  'getSentimentInsights',
  getSentimentInsightsImpl,
  {
    version: 'v1-glean-sentiment',
    ttlSeconds: 3600,
    extractTags: ([clientSlug, dateRange, modelKey]) => ({
      client: clientSlug,
      dateRange,
      models: modelKey,
    }),
  },
)

/** Stable cache-key fragment for the active model filter. */
export function modelKeyOf(models: AEOModel[] | null): string {
  if (!models || models.length === 0) return 'all'
  return [...models].sort().join(',')
}
