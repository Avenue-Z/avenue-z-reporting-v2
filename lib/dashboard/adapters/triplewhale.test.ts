// lib/dashboard/adapters/triplewhale.test.ts
// Run: npx tsx lib/dashboard/adapters/triplewhale.test.ts
import { strict as assert } from 'node:assert'
import { stubValue, resolveTripleWhaleLeaf } from './triplewhale'

// Deterministic: same inputs → same output, every run.
assert.equal(stubValue('revenue', 'last_30_days'), stubValue('revenue', 'last_30_days'))
// Different metric → different value (extremely likely; guards against constant stub).
assert.notEqual(stubValue('revenue', 'last_30_days'), stubValue('spend', 'last_30_days'))

;(async () => {
  const noCompare = await resolveTripleWhaleLeaf({ source: 'triplewhale', metric: 'revenue' }, { slug: 'ren' }, 'last_30_days', null)
  assert.equal(noCompare.prevValue, undefined) // no comparison → no prevValue

  const withCompare = await resolveTripleWhaleLeaf({ source: 'triplewhale', metric: 'revenue' }, { slug: 'ren' }, 'last_30_days', 'previous_period')
  assert.equal(typeof withCompare.prevValue, 'number') // comparison active → prevValue present
  assert.equal(withCompare.value, noCompare.value)     // value stable regardless of comparison
  console.log('ok')
})()
