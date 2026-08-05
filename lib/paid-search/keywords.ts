import { awQuery, isLeadAction } from './base'
import type { KeywordRow } from './types'
import type { PaidSearchConfig } from '@/lib/db/schema'

export function transformKeywords(metricRows: Record<string, string>[], leadRows: Record<string, string>[], cfg: PaidSearchConfig): KeywordRow[] {
  const leads = new Map<string, number>()
  for (const r of leadRows) {
    if (!isLeadAction(r.ConversionTypeName, cfg)) continue
    const k = `${r.Keyword}␟${r.Matchtype}`
    leads.set(k, (leads.get(k) ?? 0) + Number(r.Conversions || 0))
  }
  return metricRows
    .map((r): KeywordRow => {
      const clicks = Number(r.Clicks || 0), impressions = Number(r.Impressions || 0), cost = Number(r.Cost || 0)
      const l = leads.get(`${r.Keyword}␟${r.Matchtype}`) ?? 0
      return { keyword: r.Keyword, matchType: r.Matchtype, clicks, impressions, cost, leads: l, ctr: impressions ? +((clicks / impressions) * 100).toFixed(1) : 0, cpl: l ? cost / l : 0 }
    })
    .sort((a, b) => b.leads - a.leads || b.cost - a.cost)
}

export const MIN_CLICKS = 10
const TOP_N = 10

export interface KeywordTotal {
  clicks: number
  impressions: number
  cost: number
  leads: number
  ctr: number
  cpl: number
}

export interface KeywordsView {
  /** Top-N keywords by leads — the only rows that render. */
  top: KeywordRow[]
  /** Totals over the FULL set behind this view, not just the top-N (item 10, Amir). */
  total: KeywordTotal
  /** Count of keywords in the view (behind the top-N). */
  count: number
}

export interface KeywordsData {
  /** ≥10-clicks filter applied — the default view (item 11c). */
  filtered: KeywordsView
  /** No click filter — the "Show all" view. */
  all: KeywordsView
}

/**
 * Aggregate a keyword set into a bounded view: totals over the FULL set (derived
 * CTR/CPL recomputed from summed numerators/denominators, NOT summed — mirrors
 * campaign-table.tsx) plus the top-N by leads for display. Rows arrive already
 * sorted leads→cost desc from transformKeywords, so slice(0, TOP_N) is the top N.
 */
function summarize(rows: KeywordRow[]): KeywordsView {
  const agg = rows.reduce(
    (a, r) => {
      a.clicks += r.clicks
      a.impressions += r.impressions
      a.cost += r.cost
      a.leads += r.leads
      return a
    },
    { clicks: 0, impressions: 0, cost: 0, leads: 0 },
  )
  const total: KeywordTotal = {
    ...agg,
    ctr: agg.impressions ? (agg.clicks / agg.impressions) * 100 : 0,
    cpl: agg.leads ? agg.cost / agg.leads : 0,
  }
  return { top: rows.slice(0, TOP_N), total, count: rows.length }
}

/**
 * Build both keyword views (≥10-clicks filtered + all) server-side so only the
 * top-N rows + two totals cross the RSC boundary — never the full long tail,
 * which for a large Google Ads account is thousands of rows the client never
 * renders (only the totals need the full set, and those are computed here).
 */
export function buildKeywordsData(rows: KeywordRow[]): KeywordsData {
  return {
    filtered: summarize(rows.filter((r) => r.clicks >= MIN_CLICKS)),
    all: summarize(rows),
  }
}

export async function getKeywordsData(slug: string, dateRange: string): Promise<KeywordsData> {
  const { getClientBySlug } = await import('@/lib/db/queries')
  const cfg = (await getClientBySlug(slug))!.paidSearchConfig!
  const [m, l] = await Promise.all([
    awQuery(slug, ['Keyword', 'Matchtype', 'Clicks', 'Impressions', 'Cost'], dateRange),
    awQuery(slug, ['Keyword', 'Matchtype', 'ConversionTypeName', 'Conversions'], dateRange),
  ])
  return buildKeywordsData(transformKeywords(m, l, cfg))
}
