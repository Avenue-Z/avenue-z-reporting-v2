import { expect, test } from 'vitest'
import { buildTrendSeries } from './trend-series'

// getFollowerGraph reuses buildTrendSeries (a running follower count per day). trends-build.test.ts
// already covers the merge/drop/sort/null-fill contract; this guards the single-channel shape a
// scoped platform subpage returns (one series, its points in date order).
test('single-channel follower series keeps its one channel', () => {
  const s = buildTrendSeries([{ label: 'LinkedIn', daily: { '2026-06-01': 5850, '2026-06-02': 5859 } }])
  expect(s.channels).toEqual(['LinkedIn'])
  expect(s.points.map((p) => p.date)).toEqual(['2026-06-01', '2026-06-02'])
  expect(s.points[1].LinkedIn).toBe(5859)
})

// getFollowerGraph passes gapFill:'carry' because TOTAL_FOLLOWERS is a stock. A null day
// must hold the prior count, not crash the line to 0 (review finding #1).
test("carry-forward holds the last known count across a null day (no zero cliff)", () => {
  const s = buildTrendSeries(
    [{ label: 'LinkedIn', daily: { '2026-06-01': 5850, '2026-06-02': null, '2026-06-03': 5860 } }],
    { gapFill: 'carry' },
  )
  expect(s.points.map((p) => p.LinkedIn)).toEqual([5850, 5850, 5860])
})

test('carry-forward skips leading null days rather than zero-filling them', () => {
  const s = buildTrendSeries(
    [{ label: 'X', daily: { '2026-06-01': null, '2026-06-02': 1346 } }],
    { gapFill: 'carry' },
  )
  expect(s.points.map((p) => p.date)).toEqual(['2026-06-02'])
  expect(s.points[0].X).toBe(1346)
})
