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
