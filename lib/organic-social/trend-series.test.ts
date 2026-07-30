import { describe, expect, test } from 'vitest'
import { buildTrendSeries, isEmptyTrend } from './trend-series'
import type { TrendSeries } from './types'

describe('isEmptyTrend', () => {
  test('empty (no channels, no points) is empty', () => {
    expect(isEmptyTrend({ points: [], channels: [] })).toBe(true)
  })

  test('a channel with only null days (carry) yields an empty series', () => {
    // Mirrors a follower window before the account has any snapshots (renaissance X in 2025).
    const s = buildTrendSeries([{ label: 'X', daily: { '2025-01-01': null, '2025-01-02': null } }], { gapFill: 'carry' })
    expect(isEmptyTrend(s)).toBe(true)
  })

  test('any finite value makes it non-empty', () => {
    const s = buildTrendSeries([{ label: 'X', daily: { '2026-01-01': 1340, '2026-01-02': null } }], { gapFill: 'carry' })
    expect(isEmptyTrend(s)).toBe(false)
  })

  test('non-finite values do not count as data', () => {
    const s: TrendSeries = { channels: ['X'], points: [{ date: '2026-01-01', X: Number.NaN }] }
    expect(isEmptyTrend(s)).toBe(true)
  })
})
