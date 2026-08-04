import { describe, expect, test } from 'vitest'
import { transformKeywords } from './keywords'

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
    // The cap removal lives in getKeywordRows; the transform itself must never
    // truncate, so the client can total all keywords behind the ≥10-clicks filter.
    const many = Array.from({ length: 60 }, (_, i) => ({
      Keyword: `kw${i}`, Matchtype: 'Exact', Clicks: '20', Impressions: '1000', Cost: '100',
    }))
    expect(transformKeywords(many, [], cfg).length).toBe(60)
  })
})
