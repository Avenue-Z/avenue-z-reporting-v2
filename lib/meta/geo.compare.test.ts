import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('./base', () => ({ metaQuery: vi.fn(), resolveCompareIso: vi.fn(() => '2023-01-01,2023-12-31') }))

import { metaQuery } from './base'
import { BqUnavailable } from '@/lib/bq/errors'
import { getMetaGeoData } from './geo'

beforeEach(() => vi.mocked(metaQuery).mockReset())

describe('getMetaGeoData prior period', () => {
  test('a prior period the source cannot answer drops the comparison, never the section (as the KPIs do)', async () => {
    // On BigQuery a prior period before the account's history floor is refused (C2 review, Finding 1).
    vi.mocked(metaQuery).mockImplementation(async (_s, _f, range) => {
      if (range === '2023-01-01,2023-12-31') throw new BqUnavailable('unsupported', 'before the floor')
      return [{ Region: 'Texas', cost: '5' }]
    })
    expect(await getMetaGeoData('renaissance', 'custom:2024-01-01,2024-12-31', 'previous_period')).toEqual({
      rows: [{ region: 'Texas', spend: 5, linkClicks: 0, lpv: 0, engagements: 0 }],
      totalRegions: 1,
      prevTopRegionSpend: null,
      prevTotalRegions: null,
    })
  })
})
