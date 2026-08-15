import { describe, it, expect } from 'vitest'
import { fmtNum, fmtPct, fmtDuration, pct, buildTrendRows, buildChannelData, buildAudienceRows } from './reshape'

describe('formatters', () => {
  it('renders a dash for a missing number', () => {
    expect(fmtNum(null)).toBe('—')
    expect(fmtPct(undefined)).toBe('—')
  })
  it('formats a percentage from a GA4 decimal', () => {
    expect(fmtPct(0.0214)).toBe('2.1%')
  })
  it('formats a duration in minutes and seconds', () => {
    expect(fmtDuration(134)).toBe('2m 14s')
  })
  it('returns undefined for a delta with no prior value', () => {
    expect(pct(100, 0)).toBeUndefined()
    expect(pct(110, 100)).toBeCloseTo(10)
  })
})

describe('buildTrendRows', () => {
  it('returns an empty array when the current query failed', () => {
    expect(buildTrendRows(null, null)).toEqual([])
  })
  it('carries prior values onto each row when a compare set exists', () => {
    const cur = [{ date: '20260801', sessions: 10, activeUsers: 8, newUsers: 5 }]
    const cmp = [{ date: '20260701', sessions: 6, activeUsers: 5, newUsers: 3 }]
    const rows = buildTrendRows(cur, cmp)
    expect(rows).toHaveLength(1)
    expect(rows[0].sessions).toBe(10)
    expect(rows[0].prevSessions).toBe(6)
  })
  it('omits prior fields when there is no compare set', () => {
    const cur = [{ date: '20260801', sessions: 10, activeUsers: 8, newUsers: 5 }]
    expect(buildTrendRows(cur, null)[0].prevSessions).toBeUndefined()
  })
})

describe('buildChannelData', () => {
  it('returns empty structures when the query failed', () => {
    const out = buildChannelData(null, null, null)
    expect(out.volumeData).toEqual([])
    expect(out.convData).toEqual([])
  })
  it('computes share against the sum of returned rows', () => {
    const rows = [
      { sessionDefaultChannelGroup: 'Organic Search', sessions: 75, conversions: 3, sessionConversionRate: 0.04 },
      { sessionDefaultChannelGroup: 'Direct',         sessions: 25, conversions: 1, sessionConversionRate: 0.04 },
    ]
    const out = buildChannelData(rows, null, null)
    expect(out.volumeData[0].pct).toBe(75)
    expect(out.volumeData[1].pct).toBe(25)
  })
  it('excludes low-traffic rows from the conversion tab', () => {
    const rows = [
      { sessionDefaultChannelGroup: 'Organic Search', sessions: 100, conversions: 5, sessionConversionRate: 0.05 },
      { sessionDefaultChannelGroup: 'Referral',       sessions: 5,   conversions: 2, sessionConversionRate: 0.40 },
    ]
    const out = buildChannelData(rows, null, null)
    expect(out.convData.map(r => r.name)).toEqual(['Organic Search'])
  })
})

describe('buildAudienceRows', () => {
  const rows = [
    { newVsReturning: 'new',       sessions: 100, engagementRate: 0.5, averageSessionDuration: 60 },
    { newVsReturning: 'returning', sessions: 200, engagementRate: 0.7, averageSessionDuration: 120 },
  ]

  it('computes returningUserCount from the totals row when provided', () => {
    const out = buildAudienceRows(rows, { activeUsers: 62108, newUsers: 34872 })
    expect(out.returningUserCount).toBe(27236)
  })

  it('omits returningUserCount when totals are unavailable', () => {
    const out = buildAudienceRows(rows, null)
    expect(out.returningUserCount).toBeUndefined()
  })
})
