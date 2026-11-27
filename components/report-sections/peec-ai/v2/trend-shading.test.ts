import { expect, test } from 'vitest'
import { bucketKey } from '@/lib/aeo/bucket'
import type { BucketGranularity } from '@/lib/aeo/types'
import { shadeRange } from './trend-shading'

/** The bucket keys a chart over every day from `start` to `end` would have. */
function keysFor(start: string, end: string, g: BucketGranularity): string[] {
  const keys: string[] = []
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86_400_000) {
    const k = bucketKey(new Date(t), g)
    if (!keys.includes(k)) keys.push(k)
  }
  return keys
}

const WEEKLY = keysFor('2026-01-01', '2026-11-30', 'weekly')

test('weekly: the period covers the weeks of its first and last day', () => {
  // 25 Oct 2026 is a Sunday (its week starts Monday 19 Oct); 23 Nov is a Monday.
  expect(shadeRange(WEEKLY, 'weekly', { start: '2026-10-25', end: '2026-11-23' }))
    .toEqual({ from: WEEKLY.indexOf('2026-10-19'), to: WEEKLY.indexOf('2026-11-23') })
  expect(WEEKLY.indexOf('2026-10-19')).toBeGreaterThan(0)
})

test('a window wholly before the chart (same period last year) draws nothing', () => {
  expect(shadeRange(WEEKLY, 'weekly', { start: '2025-10-25', end: '2025-11-23' })).toBeNull()
})

test('a window that starts last December shades only the first week it shares with the chart', () => {
  // 1 Jan 2026 is a Thursday: the chart's first week is the one starting Monday 29 Dec 2025.
  expect(WEEKLY[0]).toBe('2025-12-29')
  expect(shadeRange(WEEKLY, 'weekly', { start: '2025-12-02', end: '2026-01-01' })).toEqual({ from: 0, to: 0 })
})

test('a window running past the chart stops at its last bucket', () => {
  const keys = keysFor('2026-01-01', '2026-11-20', 'weekly')
  expect(shadeRange(keys, 'weekly', { start: '2026-11-10', end: '2026-12-15' }))
    .toEqual({ from: keys.indexOf('2026-11-09'), to: keys.length - 1 })
})

test('monthly and quarterly buckets', () => {
  const monthly = keysFor('2026-01-01', '2026-11-30', 'monthly')
  expect(shadeRange(monthly, 'monthly', { start: '2026-10-25', end: '2026-11-23' }))
    .toEqual({ from: monthly.indexOf('2026-10'), to: monthly.indexOf('2026-11') })
  const quarterly = keysFor('2026-01-01', '2026-11-30', 'quarterly')
  expect(shadeRange(quarterly, 'quarterly', { start: '2026-10-25', end: '2026-11-23' })).toEqual({ from: 3, to: 3 })
})

test('an unreadable or reversed window, or no buckets, draws nothing', () => {
  expect(shadeRange(WEEKLY, 'weekly', { start: 'nope', end: '2026-11-23' })).toBeNull()
  expect(shadeRange(WEEKLY, 'weekly', { start: '2026-11-23', end: '2026-10-25' })).toBeNull()
  expect(shadeRange([], 'weekly', { start: '2026-10-25', end: '2026-11-23' })).toBeNull()
})
