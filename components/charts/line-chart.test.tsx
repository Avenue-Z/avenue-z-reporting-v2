import { describe, expect, test } from 'vitest'
import { niceYDomain } from './line-chart'

const mk = (vals: number[], key = 'v') => vals.map((v) => ({ [key]: v }))

describe('niceYDomain', () => {
  test('frames a high-value, low-variance series well above 0 (the flat-line bug)', () => {
    // LinkedIn followers ~5900 with tiny movement — must NOT span 0→6000.
    const [lo, hi] = niceYDomain(mk([5900, 5905, 5898, 5902, 5896]), [{ key: 'v' }])!
    expect(lo).toBeGreaterThan(5000)
    expect(lo).toBeLessThanOrEqual(5896)
    expect(hi).toBeGreaterThanOrEqual(5905)
    // The visible band is a small fraction of the value → the line actually moves.
    expect(hi - lo).toBeLessThan(5896 * 0.1)
  })

  test('small counts get headroom on both sides without touching 0', () => {
    // Instagram 29–32.
    const [lo, hi] = niceYDomain(mk([29, 30, 29, 31, 32]), [{ key: 'v' }])!
    expect(lo).toBeGreaterThanOrEqual(28)
    expect(lo).toBeLessThanOrEqual(29)
    expect(hi).toBeGreaterThanOrEqual(32)
  })

  test('clamps the floor at 0 for non-negative data that dips low', () => {
    const [lo] = niceYDomain(mk([2, 3, 5, 4]), [{ key: 'v' }])!
    expect(lo).toBeGreaterThanOrEqual(0)
  })

  test('a flat series is padded so it sits mid-chart, not on an edge', () => {
    const [lo, hi] = niceYDomain(mk([6000, 6000, 6000]), [{ key: 'v' }])!
    expect(lo).toBeLessThan(6000)
    expect(hi).toBeGreaterThan(6000)
  })

  test('spans every active series when more than one is shown', () => {
    const data = [
      { a: 100, b: 200 },
      { a: 110, b: 190 },
    ]
    const [lo, hi] = niceYDomain(data, [{ key: 'a' }, { key: 'b' }])!
    expect(lo).toBeLessThanOrEqual(100)
    expect(hi).toBeGreaterThanOrEqual(200)
  })

  test('returns undefined for empty / non-numeric data (Recharts default kicks in)', () => {
    expect(niceYDomain([], [{ key: 'v' }])).toBeUndefined()
    expect(niceYDomain([{ v: 'n/a' }], [{ key: 'v' }])).toBeUndefined()
  })
})
