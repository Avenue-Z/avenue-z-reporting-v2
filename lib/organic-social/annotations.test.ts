import { expect, test } from 'vitest'
import { pickPeaks } from './annotations'
import type { TrendSeries } from './types'

// All numbers are made up.
const AUG = { from: '2026-08-01', to: '2026-08-31' }
const series = (values: Record<string, number>, channel = 'Instagram'): TrendSeries => ({
  channels: [channel],
  points: Object.entries(values).map(([date, v]) => ({ date, [channel]: v })),
})

test('returns the highest days up to the limit, in date order', () => {
  const s = series({ '2026-08-03': 10, '2026-08-10': 50, '2026-08-20': 30, '2026-08-25': 40 })
  expect(pickPeaks(s, { limit: 2, ...AUG })).toEqual([
    { date: '2026-08-10', value: 50 },
    { date: '2026-08-25', value: 40 },
  ])
})

test('only positive days are peaks, so a quiet month returns fewer', () => {
  const s = series({ '2026-08-01': 0, '2026-08-02': -4, '2026-08-03': 6 })
  expect(pickPeaks(s, { limit: 3, ...AUG })).toEqual([{ date: '2026-08-03', value: 6 }])
})

test('a month with no positive days has no peaks', () => {
  expect(pickPeaks(series({ '2026-08-01': 0, '2026-08-02': -1 }), { limit: 3, ...AUG })).toEqual([])
})

// The Eastern window the v1 graphs send returns a day past the month on some channels.
test('a day outside the requested window is never a peak, however high', () => {
  const s = series({ '2026-08-15': 5, '2026-09-01': 999, '2026-07-31': 888 })
  expect(pickPeaks(s, { limit: 3, ...AUG })).toEqual([{ date: '2026-08-15', value: 5 }])
})

test('the first and last days of the window are inside it', () => {
  const s = series({ '2026-08-01': 5, '2026-08-31': 7 })
  expect(pickPeaks(s, { limit: 3, ...AUG }).map((p) => p.date)).toEqual(['2026-08-01', '2026-08-31'])
})

test('ties break on the earlier date, so the same data always gives the same peaks', () => {
  const s = series({ '2026-08-29': 20, '2026-08-10': 20, '2026-08-22': 26, '2026-08-05': 20 })
  expect(pickPeaks(s, { limit: 3, ...AUG })).toEqual([
    { date: '2026-08-05', value: 20 },
    { date: '2026-08-10', value: 20 },
    { date: '2026-08-22', value: 26 },
  ])
})

test('when every day is equal, the earliest days win', () => {
  const s = series({ '2026-08-04': 3, '2026-08-01': 3, '2026-08-03': 3, '2026-08-02': 3 })
  expect(pickPeaks(s, { limit: 2, ...AUG }).map((p) => p.date)).toEqual(['2026-08-01', '2026-08-02'])
})

// The deck calls out three consecutive days on one slide.
test('neighbouring days can all be peaks', () => {
  const s = series({ '2026-08-09': 40, '2026-08-10': 65, '2026-08-11': 38, '2026-08-20': 10 })
  expect(pickPeaks(s, { limit: 3, ...AUG }).map((p) => p.date)).toEqual(['2026-08-09', '2026-08-10', '2026-08-11'])
})

test('a chart with more than one channel gets no peaks', () => {
  const s: TrendSeries = {
    channels: ['Instagram', 'Facebook'],
    points: [{ date: '2026-08-10', Instagram: 50, Facebook: 40 }],
  }
  expect(pickPeaks(s, { limit: 3, ...AUG })).toEqual([])
})

test('a chart with no channels gets no peaks', () => {
  expect(pickPeaks({ channels: [], points: [] }, { limit: 3, ...AUG })).toEqual([])
})

test('a limit of zero returns nothing', () => {
  expect(pickPeaks(series({ '2026-08-10': 50 }), { limit: 0, ...AUG })).toEqual([])
})

test('a value that is not a finite number is skipped rather than ranked', () => {
  const s: TrendSeries = {
    channels: ['Instagram'],
    points: [
      { date: '2026-08-10', Instagram: 'n/a' },
      { date: '2026-08-11', Instagram: 12 },
      { date: '2026-08-12' },
    ],
  }
  expect(pickPeaks(s, { limit: 3, ...AUG })).toEqual([{ date: '2026-08-11', value: 12 }])
})
