import { describe, expect, test } from 'vitest'
import { transformKeywords, buildKeywordsData } from './keywords'
import type { KeywordRow } from './types'

const cfg = { googleAdsAccountId: '1', leadActions: [{ name: 'broker_group_lead', category: 'broker' as const }] }
const metrics = [
  { Keyword: 'dental insurance', Matchtype: 'Exact',  Clicks: '80', Impressions: '1000', Cost: '300' },
  { Keyword: 'broker benefits',  Matchtype: 'Phrase', Clicks: '40', Impressions: '500',  Cost: '500' },
  { Keyword: 'no leads kw',      Matchtype: 'Broad',  Clicks: '10', Impressions: '200',  Cost: '90'  },
]
const leads = [
  { Keyword: 'dental insurance', Matchtype: 'Exact',  ConversionTypeName: 'broker_group_lead', Conversions: '2' },
  { Keyword: 'broker benefits',  Matchtype: 'Phrase', ConversionTypeName: 'broker_group_lead', Conversions: '3' },
  { Keyword: 'broker benefits',  Matchtype: 'Phrase', ConversionTypeName: 'ignored_action',    Conversions: '9' },
]

describe('transformKeywords', () => {
  test('ranks by scoped leads and excludes non-lead actions', () => {
    const rows = transformKeywords(metrics, leads, cfg)
    expect(rows[0].keyword).toBe('broker benefits') // 3 leads ranks first
    expect(rows[0].matchType).toBe('Phrase')
    expect(rows[0].leads).toBe(3)                    // 'ignored_action' excluded
    expect(rows[1].keyword).toBe('dental insurance') // 2 leads
    expect(rows[1].ctr).toBe(8)                      // 80/1000 = 8%
    expect(rows[2].leads).toBe(0)                    // no qualified leads
  })

  test('returns the FULL keyword set — no top-50 cap (item 10)', () => {
    // The cap removal lives in getKeywordsData; the transform itself must never
    // truncate, so buildKeywordsData can total all keywords behind the ≥10-clicks filter.
    const many = Array.from({ length: 60 }, (_, i) => ({
      Keyword: `kw${i}`, Matchtype: 'Exact', Clicks: '20', Impressions: '1000', Cost: '100',
    }))
    expect(transformKeywords(many, [], cfg).length).toBe(60)
  })
})

// A keyword fixture. clicks drive the ≥10 filter; leads drive the top-N sort.
function kw(keyword: string, clicks: number, impressions: number, cost: number, leads: number): KeywordRow {
  return {
    keyword,
    matchType: 'Exact',
    clicks,
    impressions,
    cost,
    leads,
    ctr: impressions ? +((clicks / impressions) * 100).toFixed(1) : 0,
    cpl: leads ? cost / leads : 0,
  }
}

describe('buildKeywordsData (server-side aggregation — bounded payload)', () => {
  const rows: KeywordRow[] = [
    ...Array.from({ length: 25 }, (_, i) => kw(`hi${i}`, 10 + i, 1000, 100, 2)), // 25 with clicks ≥10
    ...Array.from({ length: 8 }, (_, i) => kw(`lo${i}`, i + 1, 100, 5, 0)), // 8 with clicks <10
  ]

  test('filtered view: only the top 10 rows are serialized, but the total covers all 25 filtered', () => {
    const { filtered } = buildKeywordsData(rows)
    expect(filtered.count).toBe(25)
    expect(filtered.top.length).toBe(10) // only 10 rows cross the RSC boundary
    // Total covers all 25 filtered keywords: clicks = sum(10..34), cost = 25*100.
    const expectedClicks = Array.from({ length: 25 }, (_, i) => 10 + i).reduce((a, b) => a + b, 0)
    expect(filtered.total.clicks).toBe(expectedClicks)
    expect(filtered.total.cost).toBe(2500)
    expect(filtered.total.leads).toBe(50)
  })

  test('derived metrics (CTR, CPL) are recomputed from summed numerators/denominators, not summed', () => {
    const { filtered } = buildKeywordsData(rows)
    // CPL = total cost / total leads = 2500 / 50 = 50 (not the sum of per-row CPLs).
    expect(filtered.total.cpl).toBe(2500 / 50)
    // CTR = total clicks / total impressions * 100.
    expect(filtered.total.ctr).toBeCloseTo((filtered.total.clicks / (25 * 1000)) * 100, 5)
  })

  test('all view: totals over ALL keywords, still only top 10 serialized', () => {
    const { all } = buildKeywordsData(rows)
    expect(all.count).toBe(33)
    expect(all.top.length).toBe(10)
    expect(all.total.cost).toBe(2500 + 8 * 5)
  })

  test('empty filtered view when no keyword reaches 10 clicks', () => {
    const lowOnly = Array.from({ length: 5 }, (_, i) => kw(`k${i}`, i + 1, 100, 5, 0))
    const { filtered } = buildKeywordsData(lowOnly)
    expect(filtered.count).toBe(0)
    expect(filtered.top).toEqual([])
  })
})
