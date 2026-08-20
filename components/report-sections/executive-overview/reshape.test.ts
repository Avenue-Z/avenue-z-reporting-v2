import { describe, it, expect } from 'vitest'
import { fmtNum, fmtPct, fmtDuration, pct, buildTrendRows, buildChannelData } from './reshape'

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

  it('aligns prior values by calendar day offset, not array position, when a compare day is missing', () => {
    // Compare period is missing Jul 2 (GA4 omits zero-session days rather than
    // returning a zero row), so the compare array only has 3 of the 4 days.
    // An index join (compareRows[i]) would slide every row after the gap by
    // one: Aug 2 -> Jul 3, Aug 3 -> Jul 4, Aug 4 -> out of bounds.
    const cur = [
      { date: '20260801', sessions: 10, activeUsers: 8, newUsers: 5 },
      { date: '20260802', sessions: 20, activeUsers: 16, newUsers: 9 },
      { date: '20260803', sessions: 30, activeUsers: 24, newUsers: 13 },
      { date: '20260804', sessions: 40, activeUsers: 32, newUsers: 17 },
    ]
    const cmp = [
      { date: '20260701', sessions: 1, activeUsers: 1, newUsers: 1 },
      // 20260702 missing
      { date: '20260703', sessions: 3, activeUsers: 3, newUsers: 3 },
      { date: '20260704', sessions: 4, activeUsers: 4, newUsers: 4 },
    ]
    const rows = buildTrendRows(cur, cmp)
    expect(rows).toHaveLength(4)
    expect(rows[0].prevSessions).toBe(1) // Aug 1 -> Jul 1
    expect(rows[1].prevSessions).toBeUndefined() // Aug 2 -> Jul 2 missing, must not fall back to Jul 3
    expect(rows[2].prevSessions).toBe(3) // Aug 3 -> Jul 3
    expect(rows[3].prevSessions).toBe(4) // Aug 4 -> Jul 4
  })

  it('a current day with no compare match yields a null prior, not the next day pulled forward', () => {
    const cur = [
      { date: '20260801', sessions: 10, activeUsers: 8, newUsers: 5 },
      { date: '20260802', sessions: 20, activeUsers: 16, newUsers: 9 },
    ]
    const cmp = [
      { date: '20260701', sessions: 1, activeUsers: 1, newUsers: 1 },
      // 20260702 missing entirely, nothing should be pulled forward into it
    ]
    const rows = buildTrendRows(cur, cmp)
    expect(rows[0].prevSessions).toBe(1)
    expect(rows[1].prevSessions).toBeUndefined()
    expect(rows[1].prevDate).toBeUndefined()
  })

  it('anchors on the true period-start dates so a missing leading day does not shift every offset', () => {
    // The current period truly starts Aug 1, but Aug 1 had zero sessions so
    // GA4 omitted the row entirely — the array's first returned row is Aug 2.
    // The compare period starts Jul 1 and is complete except Jul 4 is missing.
    // Without the true start dates, the old code anchored on each array's own
    // first row (Aug 2 <-> Jul 1), sliding every offset by one day.
    const cur = [
      { date: '20260802', sessions: 20, activeUsers: 16, newUsers: 9 }, // offset 1 from true start Aug 1
      { date: '20260803', sessions: 30, activeUsers: 24, newUsers: 13 }, // offset 2
      { date: '20260804', sessions: 40, activeUsers: 32, newUsers: 17 }, // offset 3
    ]
    const cmp = [
      { date: '20260701', sessions: 1, activeUsers: 1, newUsers: 1 }, // offset 0
      { date: '20260702', sessions: 2, activeUsers: 2, newUsers: 2 }, // offset 1
      { date: '20260703', sessions: 3, activeUsers: 3, newUsers: 3 }, // offset 2
      // 20260704 (offset 3) missing entirely
    ]
    const rows = buildTrendRows(cur, cmp, '20260801', '20260701')
    expect(rows).toHaveLength(3)
    expect(rows[0].prevSessions).toBe(2) // Aug 2 (offset 1) -> Jul 2 (offset 1), not Jul 1
    expect(rows[1].prevSessions).toBe(3) // Aug 3 (offset 2) -> Jul 3 (offset 2)
    expect(rows[2].prevSessions).toBeUndefined() // Aug 4 (offset 3) -> no compare row at offset 3
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

  it('computes a share of total that sums sensibly across an uneven split', () => {
    const rows = [
      { sessionDefaultChannelGroup: 'Organic Search', sessions: 41, sessionConversionRate: 0.03 },
      { sessionDefaultChannelGroup: 'Direct',          sessions: 33, sessionConversionRate: 0.02 },
      { sessionDefaultChannelGroup: 'Paid Search',     sessions: 26, sessionConversionRate: 0.05 },
    ]
    const out = buildChannelData(rows, null, null)
    const total = out.volumeData.reduce((s, r) => s + r.pct, 0)
    // Rounding each share independently can land a point or two off 100.
    // It should never be wildly off (proof the math is share-of-total, not
    // e.g. share-of-max or an unnormalized raw count).
    expect(total).toBeGreaterThanOrEqual(98)
    expect(total).toBeLessThanOrEqual(102)
    expect(out.volumeData.find(r => r.name === 'Organic Search')?.pct).toBe(41)
  })

  // Paul CR3 (207) finding: channelTotal summed only the (capped, top-N)
  // returned rows, so `pct` was share-of-top-10, not share of total traffic,
  // even though the tooltip promises "share of total traffic" and the number
  // renders under the page's true, untruncated Sessions KPI.
  it('uses the true untruncated session total as the pct denominator when provided, so shares sum to less than 100', () => {
    const rows = [
      { sessionDefaultChannelGroup: 'Organic Search', sessions: 60, sessionConversionRate: 0.03 },
      { sessionDefaultChannelGroup: 'Direct',          sessions: 20, sessionConversionRate: 0.02 },
    ]
    // True total (200) is larger than the summed row set (80): traffic exists
    // outside this capped/sorted top-N row set.
    const out = buildChannelData(rows, null, null, 200)
    expect(out.volumeData.find(r => r.name === 'Organic Search')?.pct).toBe(30) // 60 / 200
    expect(out.volumeData.find(r => r.name === 'Direct')?.pct).toBe(10)         // 20 / 200
    const total = out.volumeData.reduce((s, r) => s + r.pct, 0)
    expect(total).toBeLessThan(100)
  })

  it('falls back to the row-sum denominator when the true total is absent', () => {
    const rows = [
      { sessionDefaultChannelGroup: 'Organic Search', sessions: 75, sessionConversionRate: 0.04 },
      { sessionDefaultChannelGroup: 'Direct',          sessions: 25, sessionConversionRate: 0.02 },
    ]
    const out = buildChannelData(rows, null, null)
    expect(out.volumeData.find(r => r.name === 'Organic Search')?.pct).toBe(75)
  })

  it('falls back to the row-sum denominator when the true total is zero, rather than dividing by zero', () => {
    const rows = [
      { sessionDefaultChannelGroup: 'Organic Search', sessions: 75, sessionConversionRate: 0.04 },
      { sessionDefaultChannelGroup: 'Direct',          sessions: 25, sessionConversionRate: 0.02 },
    ]
    const out = buildChannelData(rows, null, null, 0)
    expect(out.volumeData.find(r => r.name === 'Organic Search')?.pct).toBe(75)
  })

  it('tied conversion rates resolve by session volume, matching the source', () => {
    // Raw API order deliberately scrambled — C, D, A, E, B — so the test only
    // passes if the function itself sorts by sessions before the tie-break,
    // rather than happening to preserve an already-sorted fixture.
    const rows = [
      { sessionDefaultChannelGroup: 'C', sessions: 30,  sessionConversionRate: 0 },
      { sessionDefaultChannelGroup: 'D', sessions: 50,  sessionConversionRate: 0.10 },
      { sessionDefaultChannelGroup: 'A', sessions: 700, sessionConversionRate: 0 },
      { sessionDefaultChannelGroup: 'E', sessions: 60,  sessionConversionRate: 0.05 },
      { sessionDefaultChannelGroup: 'B', sessions: 300, sessionConversionRate: 0 },
    ]
    const out = buildChannelData(rows, null, null)
    // D and E have nonzero rates and sort first; A, B, C tie at 0 and must
    // resolve by sessions desc (700, 300, 30), not raw API order (C, A, B).
    expect(out.convData.map(r => r.name)).toEqual(['D', 'E', 'A', 'B', 'C'])
  })
})
