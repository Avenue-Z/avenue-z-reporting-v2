// Run: npx tsx lib/shopify/catalog.test.ts
import { strict as assert } from 'node:assert'
import { SHOPIFY_METRICS, findShopifyMetric } from './catalog'

// non-empty, unique ids, valid formats, queries have no date clause
const FORMATS = ['currency', 'percent', 'count', 'number']
assert.ok(SHOPIFY_METRICS.length > 0)
const ids = new Set<string>()
for (const m of SHOPIFY_METRICS) {
  assert.equal(ids.has(m.id), false, `duplicate id ${m.id}`)
  ids.add(m.id)
  assert.ok(m.label.length > 0, `${m.id} needs a label`)
  assert.ok(m.query.toUpperCase().startsWith('FROM '), `${m.id} query must be a ShopifyQL body`)
  assert.equal(/\bSINCE\b|\bUNTIL\b/i.test(m.query), false, `${m.id} query must omit the date clause`)
  assert.ok(FORMATS.includes(m.format), `${m.id} bad format`)
}

// the headline metric is present and correct
const subs = findShopifyMetric('new-subscriptions')
assert.ok(subs)
assert.equal(subs!.format, 'count')
assert.ok(subs!.query.includes('orders_first_time'))
assert.ok(subs!.query.includes("subscription_or_one_time = 'subscription'"))

// lookup by query round-trips
assert.equal(findShopifyMetric(subs!.query)?.id, 'new-subscriptions')
// unknown → undefined
assert.equal(findShopifyMetric('FROM sales SHOW nope'), undefined)

console.log('ok')
