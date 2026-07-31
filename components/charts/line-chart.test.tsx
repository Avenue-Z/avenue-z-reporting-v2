import { describe, expect, test } from 'vitest'
import { niceYDomain, MIN_SPAN_FRACTION } from './line-chart'

const mk = (vals: number[], key = 'v') => vals.map((v) => ({ [key]: v }))

describe('niceYDomain', () => {
  test('frames a high-value series well above 0 without over-zooming a trivial move (PR #181 review)', () => {
    // LinkedIn followers ~5900 moving only ~9 (0.15%). Must NOT span 0→6000 (the original
    // flat-line bug), but must ALSO not frame so tightly that the 9-unit move fills the chart
    // (the inverse "lie factor"). The span is floored at ~10% of the value.
    const [lo, hi] = niceYDomain(mk([5900, 5905, 5898, 5902, 5896]), [{ key: 'v' }])!
    const span = hi - lo
    expect(lo).toBeGreaterThan(5000)          // not the 0→max span
    expect(lo).toBeLessThanOrEqual(5896)
    expect(hi).toBeGreaterThanOrEqual(5905)
    expect(span).toBeGreaterThanOrEqual(5900 * MIN_SPAN_FRACTION * 0.9) // ~590 floor
    // The 0.15% move occupies a small slice of the band → reads flat, honestly.
    expect((5905 - 5896) / span).toBeLessThan(0.05)
  })

  test('a genuinely moving series (exceeds the floor) still frames tightly', () => {
    // Followers climbing 5000→5900 (+18%) — a real trend. Range (900) is well above the ~545
    // floor, so no expansion: the climb fills the chart as it should.
    const [lo, hi] = niceYDomain(mk([5000, 5300, 5600, 5900]), [{ key: 'v' }])!
    expect(lo).toBeLessThanOrEqual(5000)
    expect(hi).toBeGreaterThanOrEqual(5900)
    expect(hi - lo).toBeLessThan(5000 * MIN_SPAN_FRACTION * 3) // tight, not floor-inflated
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
