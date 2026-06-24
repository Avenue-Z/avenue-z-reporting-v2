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

// Grouped: SELECT dim, SUM(...) AS value ... GROUP BY dim ORDER BY value DESC.
{
  const sql = buildMetricSql('ad_spend', [], { groupBy: 'channel' })
  assert.match(sql, /SELECT channel AS dim, SUM\(spend\) AS value/)
  assert.match(sql, /GROUP BY channel/)
  assert.match(sql, /ORDER BY value DESC/)
}
// Grouped + filters: filter AND clause appears AFTER BASE_WHERE.
{
  const sql = buildMetricSql('ad_spend', [{ column: 'country', values: ['US'] }], { groupBy: 'channel' })
  assert.match(sql, /AND country = 'US'/)
  assert.match(sql, /GROUP BY channel/)
}
// Grouped: unsafe dim column rejected.
assert.throws(() => buildMetricSql('ad_spend', [], { groupBy: 'bad col' }), /unsafe TripleWhale dimension/)
// Series day.
{
  const sql = buildMetricSql('ad_spend', [], { bucket: 'day' })
  assert.match(sql, /DATE_TRUNC\('day', event_date\) AS bucket/)
  assert.match(sql, /SUM\(spend\) AS value/)
  assert.match(sql, /GROUP BY bucket/)
  assert.match(sql, /ORDER BY bucket ASC/)
}
// Series week.
{
  const sql = buildMetricSql('ad_spend', [], { bucket: 'week' })
  assert.match(sql, /DATE_TRUNC\('week', event_date\) AS bucket/)
}
// Series month.
{
  const sql = buildMetricSql('ad_spend', [], { bucket: 'month' })
  assert.match(sql, /DATE_TRUNC\('month', event_date\) AS bucket/)
}

console.log('ok')
