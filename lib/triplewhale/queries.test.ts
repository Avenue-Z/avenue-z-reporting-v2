// lib/triplewhale/queries.test.ts
// Run: npx tsx lib/triplewhale/queries.test.ts
import { strict as assert } from 'node:assert'
import { TW_METRIC_SQL, isTwMetric, buildMetricSql } from './queries'

// seeded avenue-z metrics must all be supported
for (const m of ['ad_spend', 'blended_roas', 'conv_rate', 'sessions']) {
  assert.equal(isTwMetric(m), true, `${m} should be a known metric`)
}
assert.equal(isTwMetric('nonsense'), false)

// expressions present
assert.equal(TW_METRIC_SQL.ad_spend, 'SUM(spend)')
assert.ok(TW_METRIC_SQL.blended_roas.includes('NULLIF(SUM(spend), 0)'))

// buildMetricSql wires expr + placeholders + table
const sql = buildMetricSql('ad_spend')
assert.ok(sql.includes('SUM(spend) AS value'))
assert.ok(sql.includes('pixel_joined_tvf'))
assert.ok(sql.includes('@startDate') && sql.includes('@endDate'))
assert.ok(sql.includes("attribution_window = '7_days'"))
console.log('ok')
