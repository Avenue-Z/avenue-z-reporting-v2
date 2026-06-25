// Run: npx tsx lib/organic-social/trends-build.test.ts
import { strict as assert } from 'node:assert'
import { buildTrendSeries } from './trend-series'

const series = buildTrendSeries([
  { label: 'Instagram', daily: { '2026-06-02': 10, '2026-06-01': 5 } },
  { label: 'Facebook', daily: null },                       // dropped (no data)
  { label: 'X', daily: { '2026-06-01': 7, '2026-06-02': null } }, // null -> 0
])

assert.deepEqual(series.channels, ['Instagram', 'X'], 'drops channels with null daily, keeps order')
assert.deepEqual(series.points.map((p) => p.date), ['2026-06-01', '2026-06-02'], 'points sorted ascending by date')
assert.equal(series.points[0].Instagram, 5, 'fills value')
assert.equal(series.points[1].X, 0, 'null becomes 0')
console.log('trend-series: all assertions passed')
