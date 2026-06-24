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

// curated alias resolves to its expression
assert.ok(buildMetricSql('revenue').includes('SUM(channel_reported_conversion_value) AS value'))
// raw (non-curated) safe column -> SUM(column)
assert.ok(buildMetricSql('channel_reported_conversion_value').includes('SUM(channel_reported_conversion_value) AS value'))

// New tests: generic metric + filters
import { isSafeColumn, escapeSqlValue, buildMetricSql as build2 } from './queries'
assert.equal(isSafeColumn('channel'), true)
assert.equal(isSafeColumn('Bad Col'), false)
assert.equal(escapeSqlValue("O'Brien"), "O''Brien")

// single value -> `= '...'` with '-escaping
{
  const sql = build2('ad_spend', [{ column: 'channel', values: ["O'Brien"] }])
  assert.ok(sql.includes("AND channel = 'O''Brien'"))
}
// multiple values -> IN list
{
  const sql = build2('ad_spend', [{ column: 'channel', values: ['google-ads', 'facebook-ads'] }])
  assert.ok(sql.includes("AND channel IN ('google-ads', 'facebook-ads')"))
}
// empty values -> row contributes nothing
{
  const sql = build2('ad_spend', [{ column: 'channel', values: [''] }])
  assert.ok(!sql.includes('AND channel'))
}
// unsafe metric / filter column throw
assert.throws(() => build2('bad col'))
assert.throws(() => build2('ad_spend', [{ column: 'bad col', values: ['x'] }]))

console.log('ok')
