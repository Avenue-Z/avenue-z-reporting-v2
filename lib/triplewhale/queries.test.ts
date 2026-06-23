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

// New tests: generic metric + filters
import { isSafeColumn, escapeSqlValue, buildMetricSql as build2 } from './queries'

// curated alias resolves to its expression
assert.ok(build2('revenue').includes('SUM(channel_reported_conversion_value) AS value'))
// raw (non-curated) column -> SUM(column)
assert.ok(build2('channel_reported_conversion_value').includes('SUM(channel_reported_conversion_value) AS value'))
// filters append safely, with '-escaping
{
  const sql = build2('spend', [{ column: 'channel', value: "O'Brien" }])
  assert.ok(sql.includes("AND channel = 'O''Brien'"))
}
// unsafe metric / filter column throw
assert.throws(() => build2('a; DROP TABLE x'))
assert.throws(() => build2('spend', [{ column: 'bad col', value: 'x' }]))
// helpers
assert.equal(isSafeColumn('channel_reported_conversion_value'), true)
assert.equal(isSafeColumn('bad col'), false)
assert.equal(escapeSqlValue("a'b"), "a''b")

console.log('ok')
