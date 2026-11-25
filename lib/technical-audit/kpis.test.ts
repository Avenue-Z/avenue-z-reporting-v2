import { describe, expect, test } from 'vitest'
import { KPI_DEFS, deltaTone, kpiDelta, kpiValue } from './kpis'
import type { MetricsRow } from './store'

const metrics = (over: Partial<MetricsRow> = {}): MetricsRow => ({
  id: 'm', snapshotId: 's',
  sfIssueTypesIssue: 12, sfIssueTypesWarning: 5, sfIssueTypesOpportunity: 3,
  sfUrlsIssue: 100, sfUrlsWarning: 50, sfUrlsOpportunity: 10,
  ahrefsHealthScore: 88, gscIndexed: 900, gscNotIndexed: 100,
  cwvMobilePoor: 10, cwvMobileNi: 30, cwvMobileGood: 60,
  cwvDesktopPoor: 1, cwvDesktopNi: 2, cwvDesktopGood: 3,
  ...over,
})

describe('kpiValue', () => {
  test('returns null when GSC is missing', () => {
    const m = metrics({ gscIndexed: null, gscNotIndexed: null })
    expect(kpiValue('indexed', m)).toBeNull()
    expect(kpiValue('not_indexed', m)).toBeNull()
  })
  test('null metrics row gives null for every KPI', () => {
    for (const d of KPI_DEFS) expect(kpiValue(d.key, null)).toBeNull()
  })
  test('maps each KPI to its column', () => {
    const m = metrics()
    expect(kpiValue('health', m)).toBe(88)
    expect(kpiValue('sf_issue_types', m)).toBe(12)
    expect(kpiValue('indexed', m)).toBe(900)
    expect(kpiValue('not_indexed', m)).toBe(100)
    expect(kpiValue('cwv_poor_mobile', m)).toBe(10)
    expect(kpiValue('cwv_good_pct_mobile', m)).toBe(60)
  })
  test('cwv good pct is null when any input is null or the total is 0', () => {
    expect(kpiValue('cwv_good_pct_mobile', metrics({ cwvMobileNi: null }))).toBeNull()
    expect(kpiValue('cwv_good_pct_mobile', metrics({ cwvMobilePoor: 0, cwvMobileNi: 0, cwvMobileGood: 0 }))).toBeNull()
  })
})

describe('KPI_DEFS', () => {
  test('has the six KPIs with Appendix A.1 directions', () => {
    expect(KPI_DEFS.map((d) => [d.key, d.better])).toEqual([
      ['health', 'higher'], ['sf_issue_types', 'lower'], ['indexed', 'higher'],
      ['not_indexed', 'lower'], ['cwv_poor_mobile', 'lower'], ['cwv_good_pct_mobile', 'higher'],
    ])
  })
})

describe('kpiDelta', () => {
  test('is null when either side is null', () => {
    expect(kpiDelta(null, 5)).toBeNull()
    expect(kpiDelta(5, null)).toBeNull()
    expect(kpiDelta(7, 5)).toBe(2)
  })
})

describe('deltaTone', () => {
  test('lower-is-better KPI going down is good', () => {
    expect(deltaTone('sf_issue_types', -3)).toBe('good')
    expect(deltaTone('sf_issue_types', 3)).toBe('bad')
  })
  test('higher-is-better KPI going up is good; zero is flat; null is null', () => {
    expect(deltaTone('health', 2)).toBe('good')
    expect(deltaTone('health', -2)).toBe('bad')
    expect(deltaTone('health', 0)).toBe('flat')
    expect(deltaTone('health', null)).toBeNull()
  })
})
