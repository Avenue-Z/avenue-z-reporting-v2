import { afterEach, describe, expect, it, vi } from 'vitest'
import { aeoWindow, graphViews, parseAeoMin, parseAeoRange } from './params'

describe('parseAeoRange (the aeo= URL param)', () => {
  it('month, ytd and all pass', () => {
    expect(parseAeoRange('month')).toBe('month')
    expect(parseAeoRange('ytd')).toBe('ytd')
    expect(parseAeoRange('all')).toBe('all')
  })
  it('anything else is month', () => {
    for (const raw of [undefined, null, '', 'YTD', 'All', ' ytd', ['ytd'], 3, 'year']) expect(parseAeoRange(raw), String(raw)).toBe('month')
  })
})

describe('parseAeoMin (the aeomin= URL param)', () => {
  it('1 to 5 pass as numbers', () => {
    for (const n of [1, 2, 3, 4, 5]) expect(parseAeoMin(String(n))).toBe(n)
  })
  it('anything else is 2, the outline\'s "Min 2 competitors"', () => {
    for (const raw of [undefined, null, '', '0', '6', '2.5', '02', ' 3', 'abc', ['3'], 3]) expect(parseAeoMin(raw), String(raw)).toBe(2)
  })
})

describe('aeoWindow (spec section 2)', () => {
  const OCT = 'custom:2026-10-01,2026-10-31'
  const at = (o: Partial<Parameters<typeof aeoWindow>[0]> = {}) => aeoWindow({ servedRange: OCT, range: 'month', allTimeFrom: '2026-01-22', today: '2026-11-12', ...o })

  it('Month is the served month, compared with the same number of days before it', () => {
    expect(at()).toEqual({ kind: 'ok', window: { start: '2026-10-01', end: '2026-10-31' }, asOf: '2026-10-31', monthLabel: 'October 2026', previousDays: 31 })
  })
  it('YTD runs January 1 to the end of the served month, with no change', () => {
    expect(at({ range: 'ytd' })).toEqual({ kind: 'ok', window: { start: '2026-01-01', end: '2026-10-31' }, asOf: '2026-10-31', monthLabel: 'October 2026', previousDays: null })
  })
  it('All time runs from the client\'s first data day to the end of the served month, with no change', () => {
    expect(at({ range: 'all' })).toEqual({ kind: 'ok', window: { start: '2026-01-22', end: '2026-10-31' }, asOf: '2026-10-31', monthLabel: 'October 2026', previousDays: null })
  })
  it('the in-progress month runs to yesterday (UTC), never today (review-log minor 8)', () => {
    expect(at({ servedRange: 'custom:2026-11-01,2026-11-30' })).toEqual({ kind: 'ok', window: { start: '2026-11-01', end: '2026-11-11' }, asOf: '2026-11-11', monthLabel: 'November 2026', previousDays: 11 })
    expect(at({ servedRange: 'custom:2026-11-01,2026-11-30', range: 'ytd' })).toMatchObject({ window: { start: '2026-01-01', end: '2026-11-11' }, asOf: '2026-11-11' })
  })
  it('the first day of a month has no finished day yet: not-started, for every range', () => {
    for (const range of ['month', 'ytd', 'all'] as const) {
      expect(at({ servedRange: 'custom:2026-11-01,2026-11-30', today: '2026-11-01', range })).toEqual({ kind: 'not-started', monthLabel: 'November 2026' })
    }
    expect(at({ servedRange: 'custom:2027-01-01,2027-01-31', today: '2027-01-01', range: 'ytd' })).toEqual({ kind: 'not-started', monthLabel: 'January 2027' })
  })
  it('the served month is the month of the range\'s last day, whatever day it starts on', () => {
    expect(at({ servedRange: 'custom:2026-09-15,2026-10-14' })).toMatchObject({ window: { start: '2026-10-01', end: '2026-10-31' }, monthLabel: 'October 2026' })
    expect(at({ servedRange: '2026-09-15,2026-10-14' })).toMatchObject({ window: { start: '2026-10-01', end: '2026-10-31' } })
  })
  it('All time for a month that ends before the client\'s first data day is before-data, never a backwards window', () => {
    expect(at({ servedRange: 'custom:2025-12-01,2025-12-31', range: 'all' })).toEqual({ kind: 'before-data', monthLabel: 'December 2025' })
    // the month that holds the first data day starts All time on that day
    expect(at({ servedRange: 'custom:2026-01-01,2026-01-31', range: 'all' })).toMatchObject({ kind: 'ok', window: { start: '2026-01-22', end: '2026-01-31' } })
  })
  it('February, leap years and month ends are real calendar months', () => {
    expect(at({ servedRange: 'custom:2028-02-01,2028-02-29', today: '2028-03-10' })).toMatchObject({ window: { start: '2028-02-01', end: '2028-02-29' }, previousDays: 29 })
    expect(at({ servedRange: 'custom:2026-02-01,2026-02-28' })).toMatchObject({ window: { start: '2026-02-01', end: '2026-02-28' }, previousDays: 28 })
  })
  it('a served range or today that is not a real date throws, so nothing nonsensical reaches Peec', () => {
    expect(() => at({ servedRange: 'custom:abc,def' })).toThrow(RangeError)
    expect(() => at({ servedRange: 'custom:2026-10-01,2026-10-32' })).toThrow(RangeError)
    expect(() => at({ today: '2026-11-31' })).toThrow(RangeError)
    expect(() => at({ range: 'all', allTimeFrom: '2026-1-22' })).toThrow(RangeError)
  })

  describe('a preset range resolves on the same clock every other tab uses (lib/date-range.ts)', () => {
    afterEach(() => vi.useRealTimers())
    it('last_30_days ends yesterday, so its month is the current one, run to yesterday', () => {
      vi.useFakeTimers({ now: new Date(2026, 10, 12, 12, 0, 0), toFake: ['Date'] })
      expect(at({ servedRange: 'last_30_days' })).toEqual({ kind: 'ok', window: { start: '2026-11-01', end: '2026-11-11' }, asOf: '2026-11-11', monthLabel: 'November 2026', previousDays: 11 })
    })
  })
})

describe('graphViews', () => {
  it('buckets the window weekly from its start, rounding a partial last week up', () => {
    expect(graphViews({ start: '2026-10-01', end: '2026-10-31' })).toEqual({ from: '2026-10-01', weeks: 5 })
    expect(graphViews({ start: '2026-10-01', end: '2026-10-28' })).toEqual({ from: '2026-10-01', weeks: 4 })
    expect(graphViews({ start: '2026-11-01', end: '2026-11-01' })).toEqual({ from: '2026-11-01', weeks: 1 })
    expect(graphViews({ start: '2026-01-01', end: '2026-10-31' })).toEqual({ from: '2026-01-01', weeks: 44 })
  })
})
