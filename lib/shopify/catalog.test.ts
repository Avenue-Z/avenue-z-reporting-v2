// Run: npx tsx lib/shopify/catalog.test.ts
import { strict as assert } from 'node:assert'
import { SHOPIFY_DIMENSIONS, SHOPIFY_DIM_RE } from './catalog'

assert.equal(SHOPIFY_DIMENSIONS.length, 6, 'exactly the 6 curated dimensions')
assert.ok(SHOPIFY_DIMENSIONS.some((d) => d.id === 'sales_channel'), 'includes sales_channel')
for (const d of SHOPIFY_DIMENSIONS) {
  assert.equal(SHOPIFY_DIM_RE.test(d.id), true, `${d.id} must be a safe column`)
  assert.ok(d.label.length > 0)
}
assert.equal(SHOPIFY_DIM_RE.test('a; DROP'), false)
assert.equal(SHOPIFY_DIM_RE.test('UPPER'), false)
console.log('ok')
